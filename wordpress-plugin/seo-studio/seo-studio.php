<?php
/**
 * Plugin Name: SEO Studio Connector
 * Description: SEO metadata controls and a permission-checked REST interface for SEO Studio.
 * Version: 0.5.0
 * Requires at least: 6.2
 * Requires PHP: 8.0
 * License: GPL-2.0-or-later
 * Text Domain: seo-studio
 */

if (!defined('ABSPATH')) { exit; }

final class SEO_Studio_Connector {
	const VERSION = '0.5.0';
	const META_TITLE = '_seo_studio_title';
	const META_DESCRIPTION = '_seo_studio_description';
	const META_CANONICAL = '_seo_studio_canonical';
	const META_ROBOTS = '_seo_studio_robots';
	const META_SCHEMA = '_seo_studio_schema';
	const META_IMAGE_ALT = '_wp_attachment_image_alt';
	const REDIRECT_OPTION = 'seo_studio_redirects';
	const SITEMAP_OPTION = 'seo_studio_sitemap_control';
	const SYNC_STATE_OPTION = 'seo_studio_sync_state';

	public static function init() {
		add_action('init', [__CLASS__, 'register_meta']);
		add_action('add_meta_boxes', [__CLASS__, 'add_meta_box']);
		add_action('save_post', [__CLASS__, 'save_meta'], 10, 2);
		add_action('wp_head', [__CLASS__, 'render_meta'], 1);
		add_filter('pre_get_document_title', [__CLASS__, 'filter_title'], 20);
		add_filter('wpseo_title', [__CLASS__, 'filter_title'], 20);
		add_filter('wpseo_metadesc', [__CLASS__, 'filter_description'], 20);
		add_filter('wpseo_canonical', [__CLASS__, 'filter_canonical'], 20);
		add_filter('rank_math/frontend/title', [__CLASS__, 'filter_title'], 20);
		add_filter('rank_math/frontend/description', [__CLASS__, 'filter_description'], 20);
		add_filter('rank_math/frontend/canonical', [__CLASS__, 'filter_canonical'], 20);
		add_filter('aioseo_title', [__CLASS__, 'filter_title'], 20);
		add_filter('aioseo_description', [__CLASS__, 'filter_description'], 20);
		add_filter('aioseo_canonical_url', [__CLASS__, 'filter_canonical'], 20);
		add_filter('aioseo_robots_meta', [__CLASS__, 'filter_robots_attributes'], 20);
		add_filter('seopress_titles_title', [__CLASS__, 'filter_title'], 20);
		add_filter('seopress_titles_desc', [__CLASS__, 'filter_description'], 20);
		add_filter('seopress_titles_canonical', [__CLASS__, 'filter_seopress_canonical'], 20);
		add_filter('seopress_titles_robots', [__CLASS__, 'filter_robots_string'], 20);
		add_filter('wpseo_robots', [__CLASS__, 'filter_robots_string'], 20);
		add_filter('rank_math/frontend/robots', [__CLASS__, 'filter_robots_attributes'], 20);
		add_filter('wp_robots', [__CLASS__, 'filter_robots'], 20);
		add_filter('wp_sitemaps_enabled', [__CLASS__, 'core_sitemaps_enabled'], 20);
		add_action('template_redirect', [__CLASS__, 'maybe_redirect'], 1);
		add_action('admin_notices', [__CLASS__, 'compatibility_notice']);
		add_action('admin_menu', [__CLASS__, 'add_settings_page']);
		add_action('admin_post_seo_studio_sync', [__CLASS__, 'sync_now']);
		add_action('save_post', [__CLASS__, 'schedule_post_sync'], 20, 3);
		add_action('transition_post_status', [__CLASS__, 'schedule_post_transition'], 20, 3);
		add_action('before_delete_post', [__CLASS__, 'sync_deleted_post'], 10, 2);
		add_action('seo_studio_sync_post', [__CLASS__, 'sync_post_to_app'], 10, 1);
		add_action('seo_studio_retry_sync_post', [__CLASS__, 'sync_post_to_app'], 10, 1);
		add_action('rest_api_init', [__CLASS__, 'register_routes']);
	}

	public static function seo_post_types() {
		$types = get_post_types(['public' => true, 'show_ui' => true], 'names');
		if (post_type_exists('attachment')) $types[] = 'attachment';
		if (class_exists('WooCommerce') && post_type_exists('product')) $types[] = 'product';
		return array_values(array_diff(array_unique($types), ['wp_block', 'wp_template', 'wp_template_part', 'wp_navigation']));
	}

	public static function register_meta() {
		foreach (self::seo_post_types() as $type) {
			foreach ([self::META_TITLE, self::META_DESCRIPTION, self::META_CANONICAL, self::META_ROBOTS, self::META_SCHEMA] as $key) {
				register_post_meta($type, $key, [
					'type' => 'string', 'single' => true, 'show_in_rest' => true,
					'auth_callback' => static function ($allowed, $meta_key, $object_id) { return current_user_can('edit_post', $object_id); },
					'sanitize_callback' => $key === self::META_SCHEMA ? [__CLASS__, 'sanitize_schema'] : null,
				]);
			}
		}
	}

	public static function add_meta_box() {
		foreach (self::seo_post_types() as $type) add_meta_box('seo-studio-meta', __('SEO Studio', 'seo-studio'), [__CLASS__, 'render_meta_box'], $type, 'normal', 'high');
	}

	public static function render_meta_box($post) {
		wp_nonce_field('seo_studio_save_meta', 'seo_studio_nonce');
		$fields = [
			self::META_TITLE => __('SEO title', 'seo-studio'),
			self::META_DESCRIPTION => __('Meta description', 'seo-studio'),
			self::META_CANONICAL => __('Canonical URL', 'seo-studio'),
			self::META_ROBOTS => __('Robots directives (e.g. noindex,follow)', 'seo-studio'),
		];
		foreach ($fields as $key => $label) {
			$value = get_post_meta($post->ID, $key, true);
			printf('<p><label for="%1$s"><strong>%2$s</strong></label><br><input class="widefat" id="%1$s" name="%1$s" value="%3$s"></p>', esc_attr($key), esc_html($label), esc_attr($value));
		}
		if ($post->post_type === 'attachment') printf('<p><label for="%1$s"><strong>%2$s</strong></label><br><input class="widefat" id="%1$s" name="%1$s" value="%3$s"></p>', esc_attr(self::META_IMAGE_ALT), esc_html__('Image alt text', 'seo-studio'), esc_attr(get_post_meta($post->ID, self::META_IMAGE_ALT, true)));
		$schema = get_post_meta($post->ID, self::META_SCHEMA, true);
		printf('<p><label for="%1$s"><strong>%2$s</strong></label><br><textarea class="widefat" rows="7" id="%1$s" name="%1$s">%3$s</textarea><small>%4$s</small></p>', esc_attr(self::META_SCHEMA), esc_html__('JSON-LD (JSON object or array)', 'seo-studio'), esc_textarea($schema), esc_html__('Invalid JSON is rejected when saved.', 'seo-studio'));
	}

	public static function save_meta($post_id, $post) {
		if (!isset($_POST['seo_studio_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['seo_studio_nonce'])), 'seo_studio_save_meta')) return;
		if (wp_is_post_autosave($post_id) || wp_is_post_revision($post_id) || !current_user_can('edit_post', $post_id)) return;
		$plain = [self::META_TITLE => 300, self::META_DESCRIPTION => 500, self::META_ROBOTS => 100];
		foreach ($plain as $key => $limit) {
			if (isset($_POST[$key])) {
				$clean = sanitize_text_field(wp_unslash($_POST[$key]));
				$value = function_exists('mb_substr') ? mb_substr($clean, 0, $limit) : substr($clean, 0, $limit);
				self::record_change($post_id, $key, get_post_meta($post_id, $key, true), $value, 'editor');
				update_post_meta($post_id, $key, $value);
			}
		}
		if (isset($_POST[self::META_CANONICAL])) {
			$value = esc_url_raw(wp_unslash($_POST[self::META_CANONICAL]), ['http', 'https']);
			self::record_change($post_id, self::META_CANONICAL, get_post_meta($post_id, self::META_CANONICAL, true), $value, 'editor');
			update_post_meta($post_id, self::META_CANONICAL, $value);
		}
		if ($post->post_type === 'attachment' && isset($_POST[self::META_IMAGE_ALT])) {
			$raw_alt = sanitize_text_field(wp_unslash($_POST[self::META_IMAGE_ALT]));
			$value = function_exists('mb_substr') ? mb_substr($raw_alt, 0, 300) : substr($raw_alt, 0, 300);
			self::record_change($post_id, self::META_IMAGE_ALT, get_post_meta($post_id, self::META_IMAGE_ALT, true), $value, 'editor');
			update_post_meta($post_id, self::META_IMAGE_ALT, $value);
		}
		if (isset($_POST[self::META_SCHEMA])) {
			$raw = trim(wp_unslash($_POST[self::META_SCHEMA]));
			if ($raw === '') { self::record_change($post_id, self::META_SCHEMA, get_post_meta($post_id, self::META_SCHEMA, true), '', 'editor'); delete_post_meta($post_id, self::META_SCHEMA); }
			else {
				$decoded = json_decode($raw);
				if (json_last_error() === JSON_ERROR_NONE && (is_array($decoded) || is_object($decoded))) { self::record_change($post_id, self::META_SCHEMA, get_post_meta($post_id, self::META_SCHEMA, true), $raw, 'editor'); update_post_meta($post_id, self::META_SCHEMA, $raw); }
			}
		}
	}

	public static function sanitize_schema($value) {
		if (!is_string($value) || trim($value) === '') return '';
		$decoded = json_decode($value);
		return json_last_error() === JSON_ERROR_NONE && (is_array($decoded) || is_object($decoded)) ? $value : '';
	}

	private static function current_value($key) {
		$id = get_queried_object_id();
		return $id ? get_post_meta($id, $key, true) : '';
	}

	public static function filter_title($title) { return self::current_value(self::META_TITLE) ?: $title; }
	public static function filter_description($description) { return self::current_value(self::META_DESCRIPTION) ?: $description; }
	public static function filter_canonical($canonical) { return self::current_value(self::META_CANONICAL) ?: $canonical; }

	public static function filter_seopress_canonical($canonical) {
		$url = self::current_value(self::META_CANONICAL);
		return $url ? '<link rel="canonical" href="' . esc_url($url) . '" />' : $canonical;
	}

	private static function custom_robots_directives() {
		$raw = self::current_value(self::META_ROBOTS);
		$allowed = ['index', 'noindex', 'follow', 'nofollow', 'noarchive', 'nosnippet', 'noimageindex', 'notranslate'];
		$directives = [];
		foreach (preg_split('/\s*,\s*/', (string) $raw, -1, PREG_SPLIT_NO_EMPTY) as $directive) {
			$key = sanitize_key(explode(':', $directive, 2)[0]);
			if (in_array($key, $allowed, true)) $directives[] = $key;
		}
		return array_values(array_unique($directives));
	}

	public static function filter_robots_attributes($robots) {
		if (!is_array($robots)) return $robots;
		foreach (self::custom_robots_directives() as $directive) {
			$opposite = ['index' => 'noindex', 'noindex' => 'index', 'follow' => 'nofollow', 'nofollow' => 'follow'][$directive] ?? null;
			if ($opposite) unset($robots[$opposite]);
			$robots[$directive] = $directive;
		}
		return $robots;
	}

	public static function filter_robots_string($robots) {
		if (!is_string($robots)) return $robots;
		$directives = array_map('trim', preg_split('/\s*,\s*/', $robots, -1, PREG_SPLIT_NO_EMPTY));
		foreach (self::custom_robots_directives() as $directive) {
			$opposite = ['index' => 'noindex', 'noindex' => 'index', 'follow' => 'nofollow', 'nofollow' => 'follow'][$directive] ?? null;
			if ($opposite) $directives = array_values(array_filter($directives, static function ($value) use ($opposite) { return sanitize_key(explode(':', $value, 2)[0]) !== $opposite; }));
			$directives[] = $directive;
		}
		return implode(', ', array_values(array_unique($directives)));
	}

	public static function render_meta() {
		if (is_admin() || self::has_seo_plugin()) return;
		$id = get_queried_object_id();
		if (!$id) return;
		$description = get_post_meta($id, self::META_DESCRIPTION, true);
		$canonical = get_post_meta($id, self::META_CANONICAL, true);
		$robots = get_post_meta($id, self::META_ROBOTS, true);
		$schema = get_post_meta($id, self::META_SCHEMA, true);
		if ($description) printf("\n<meta name=\"description\" content=\"%s\">\n", esc_attr($description));
		if ($canonical) printf("<link rel=\"canonical\" href=\"%s\">\n", esc_url($canonical));
		if ($robots) printf("<meta name=\"robots\" content=\"%s\">\n", esc_attr($robots));
		if ($schema && json_decode($schema) !== null) printf("<script type=\"application/ld+json\">%s</script>\n", wp_json_encode(json_decode($schema), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT));
	}

	public static function filter_robots($robots) {
		if (self::has_seo_plugin()) return $robots;
		$directives = preg_split('/\s*,\s*/', (string) self::current_value(self::META_ROBOTS), -1, PREG_SPLIT_NO_EMPTY);
		foreach ($directives as $directive) {
			$parts = explode(':', $directive, 2);
			$key = sanitize_key($parts[0]);
			if ($key && in_array($key, ['noindex', 'index', 'nofollow', 'follow', 'noarchive', 'nosnippet'], true)) $robots[$key] = true;
		}
		return $robots;
	}

	private static function record_change($post_id, $key, $before, $after, $source) {
		if ((string) $before === (string) $after) return;
		add_post_meta($post_id, '_seo_studio_change_history', [
			'field' => sanitize_key($key), 'before' => (string) $before, 'after' => (string) $after,
			'source' => sanitize_key($source), 'userId' => get_current_user_id(), 'changedAt' => current_time('mysql', true),
		], false);
	}

	private static function has_seo_plugin() {
		if (defined('WPSEO_VERSION') || defined('RANK_MATH_VERSION') || defined('AIOSEO_VERSION') || defined('SEOPRESS_VERSION') || defined('SLIM_SEO_VERSION')) return true;
		$active = array_merge((array) get_option('active_plugins', []), array_keys((array) get_site_option('active_sitewide_plugins', [])));
		foreach ($active as $plugin) if (preg_match('/(?:wordpress-seo|seo-by-rank-math|all-in-one-seo|autodescription|wp-seopress|slim-seo|squirrly-seo)/i', (string) $plugin)) return true;
		return false;
	}

	public static function compatibility_notice() {
		$sync_status = sanitize_key($_GET['seo_studio_sync'] ?? '');
		if (current_user_can('manage_options') && isset($_GET['page']) && $_GET['page'] === 'seo-studio' && $sync_status) {
			$success = $sync_status === 'success';
			printf('<div class="notice %1$s"><p>%2$s</p></div>', $success ? 'notice-success' : 'notice-error', esc_html($success ? __('Content sync completed.', 'seo-studio') : __('Content sync failed. Check the app URL, token, and network access.', 'seo-studio')));
		}
		if (current_user_can('manage_options') && isset($_GET['page']) && $_GET['page'] === 'seo-studio') {
			$sync = get_option(self::SYNC_STATE_OPTION, []);
			if (is_array($sync) && ($sync['status'] ?? '') === 'failed') printf('<div class="notice notice-error"><p>%s</p></div>', esc_html(sprintf(__('Automatic sync failed after %1$d attempts (HTTP %2$d). Check the app URL, token, and network access, then save a post or run a manual sync.', 'seo-studio'), absint($sync['attempts'] ?? 0), absint($sync['httpStatus'] ?? 0))));
			elseif (is_array($sync) && ($sync['status'] ?? '') === 'retrying') printf('<div class="notice notice-warning"><p>%s</p></div>', esc_html(sprintf(__('Automatic content sync is retrying (%d of 5).', 'seo-studio'), absint($sync['attempts'] ?? 0))));
		}
		if (!current_user_can('manage_options') || !self::has_seo_plugin()) return;
		printf('<div class="notice notice-info"><p>%s</p></div>', esc_html__('SEO Studio detected an active SEO plugin. SEO Studio stores its own metadata, but front-end output can be delegated only to explicitly supported plugin filters. Check the connection diagnostics before enabling overlapping output.', 'seo-studio'));
	}

	public static function add_settings_page() {
		add_options_page(__('SEO Studio Connection', 'seo-studio'), __('SEO Studio', 'seo-studio'), 'manage_options', 'seo-studio', [__CLASS__, 'settings_page']);
	}

	public static function settings_page() {
		if (!current_user_can('manage_options')) return;
		if (isset($_POST['seo_studio_settings_nonce']) && wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['seo_studio_settings_nonce'])), 'seo_studio_settings')) {
			$url = esc_url_raw(wp_unslash($_POST['seo_studio_app_url'] ?? ''), ['https']);
			$token = sanitize_text_field(wp_unslash($_POST['seo_studio_token'] ?? ''));
			update_option('seo_studio_app_url', untrailingslashit($url), false);
			if ($token !== '') self::store_app_token($token);
			echo '<div class="notice notice-success"><p>' . esc_html__('SEO Studio connection settings saved.', 'seo-studio') . '</p></div>';
		}
		$app_url = get_option('seo_studio_app_url', '');
		$token = self::get_app_token();
		?>
		<div class="wrap">
			<h1><?php esc_html_e('SEO Studio connection', 'seo-studio'); ?></h1>
			<p><?php esc_html_e('Connect this WordPress site to your SEO Studio workspace. Use HTTPS and a one-time token generated for this website.', 'seo-studio'); ?></p>
			<form method="post">
				<?php wp_nonce_field('seo_studio_settings', 'seo_studio_settings_nonce'); ?>
				<table class="form-table"><tbody>
					<tr><th><label for="seo_studio_app_url"><?php esc_html_e('SEO Studio application URL', 'seo-studio'); ?></label></th><td><input class="regular-text" type="url" id="seo_studio_app_url" name="seo_studio_app_url" value="<?php echo esc_attr($app_url); ?>" placeholder="https://app.example.com" required></td></tr>
					<tr><th><label for="seo_studio_token"><?php esc_html_e('Website connection token', 'seo-studio'); ?></label></th><td><input class="regular-text" type="password" id="seo_studio_token" name="seo_studio_token" value="" autocomplete="new-password" placeholder="<?php echo $token ? esc_attr__('Token saved. Leave blank to keep it.', 'seo-studio') : ''; ?>" <?php echo $token ? '' : 'required'; ?>><p class="description"><?php esc_html_e('The token is stored in this WordPress site and never sent to the browser after saving. Rotating it in the app requires replacing it here.', 'seo-studio'); ?></p></td></tr>
				</tbody></table>
				<?php submit_button(__('Save connection', 'seo-studio')); ?>
			</form>
			<hr>
			<h2><?php esc_html_e('Synchronize content', 'seo-studio'); ?></h2>
			<p><?php esc_html_e('Send up to 100 published posts and their SEO metadata to the connected website workspace.', 'seo-studio'); ?></p>
			<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
				<input type="hidden" name="action" value="seo_studio_sync">
				<?php wp_nonce_field('seo_studio_sync'); ?>
				<?php submit_button(__('Sync published content now', 'seo-studio'), 'secondary', 'submit', false); ?>
			</form>
		</div>
		<?php
	}

	/** Encrypt connection credentials at rest with the site's WordPress authentication salt. */
	private static function encrypt_app_token($token) {
		$key = hash('sha256', wp_salt('auth'), true);
		$iv = random_bytes(12);
		$tag = '';
		$ciphertext = openssl_encrypt($token, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
		if ($ciphertext === false) return false;
		return 'enc1:' . base64_encode($iv . $tag . $ciphertext);
	}

	private static function decrypt_app_token($stored) {
		if (strpos($stored, 'enc1:') !== 0) return $stored;
		$payload = base64_decode(substr($stored, 5), true);
		if ($payload === false || strlen($payload) < 29) return '';
		$key = hash('sha256', wp_salt('auth'), true);
		$iv = substr($payload, 0, 12);
		$tag = substr($payload, 12, 16);
		return openssl_decrypt(substr($payload, 28), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag) ?: '';
	}

	private static function store_app_token($token) {
		$encrypted = self::encrypt_app_token($token);
		if ($encrypted !== false) update_option('seo_studio_app_token', $encrypted, false);
	}

	private static function get_app_token() {
		$stored = (string) get_option('seo_studio_app_token', '');
		if ($stored === '') return '';
		if (strpos($stored, 'enc1:') === 0) return self::decrypt_app_token($stored);
		// Migrate existing plaintext installations once, while preserving compatibility.
		self::store_app_token($stored);
		return $stored;
	}

	private static function sync_meta($post_id, $field) {
		$custom = get_post_meta($post_id, self::META_TITLE, true);
		if ($field === 'title' && $custom) return $custom;
		$custom = get_post_meta($post_id, self::META_DESCRIPTION, true);
		if ($field === 'description' && $custom) return $custom;
		$custom = get_post_meta($post_id, self::META_CANONICAL, true);
		if ($field === 'canonical' && $custom) return $custom;
		$keys = [
			'title' => ['_yoast_wpseo_title', '_rank_math_title', '_seopress_titles_title'],
			'description' => ['_yoast_wpseo_metadesc', '_rank_math_description', '_seopress_titles_desc'],
			'canonical' => ['_yoast_wpseo_canonical', '_rank_math_canonical_url', '_seopress_robots_canonical'],
			'robots' => ['_yoast_wpseo_meta-robots-noindex', 'rank_math_robots'],
		];
		foreach ($keys[$field] ?? [] as $key) {
			$value = get_post_meta($post_id, $key, true);
			if ($value !== '') return is_array($value) ? implode(',', array_map('sanitize_text_field', $value)) : sanitize_text_field($value);
		}
		return $field === 'robots' ? get_post_meta($post_id, self::META_ROBOTS, true) : '';
	}

	public static function sync_now() {
		if (!current_user_can('manage_options')) wp_die(esc_html__('You are not allowed to synchronize this site.', 'seo-studio'));
		check_admin_referer('seo_studio_sync');
		$app_url = untrailingslashit(esc_url_raw(get_option('seo_studio_app_url', ''), ['https']));
		$token = self::get_app_token();
		if (!$app_url || !preg_match('/^sseo_[A-Za-z0-9_-]{40,60}$/', $token)) {
			wp_safe_redirect(add_query_arg(['page' => 'seo-studio', 'seo_studio_sync' => 'missing'], admin_url('options-general.php')));
			exit;
		}
		$posts = [];
		foreach (self::seo_post_types() as $type) {
			foreach (get_posts(['post_type' => $type, 'post_status' => 'publish', 'posts_per_page' => max(0, 100 - count($posts)), 'orderby' => 'ID', 'order' => 'ASC']) as $post) {
				if (count($posts) >= 100) break 2;
				$posts[] = [
					'postId' => (int) $post->ID,
					'postType' => $type,
					'title' => get_the_title($post),
					'url' => get_permalink($post),
					'status' => 'publish',
					'meta' => [
						'title' => self::sync_meta($post->ID, 'title'),
						'description' => self::sync_meta($post->ID, 'description'),
						'canonical' => self::sync_meta($post->ID, 'canonical'),
						'robots' => self::sync_meta($post->ID, 'robots'),
					],
				];
			}
		}
		$response = wp_remote_post($app_url . '/api/plugin/v1/sync', [
			'timeout' => 25,
			'redirection' => 0,
			'headers' => ['Authorization' => 'Bearer ' . $token, 'Content-Type' => 'application/json', 'Accept' => 'application/json'],
			'body' => wp_json_encode(['siteUrl' => home_url('/'), 'pluginVersion' => self::VERSION, 'posts' => $posts]),
		]);
		$success = !is_wp_error($response) && wp_remote_retrieve_response_code($response) >= 200 && wp_remote_retrieve_response_code($response) < 300;
		wp_safe_redirect(add_query_arg(['page' => 'seo-studio', 'seo_studio_sync' => $success ? 'success' : 'error'], admin_url('options-general.php')));
		exit;
	}

	public static function schedule_post_sync($post_id, $post, $update) {
		if (!$post || wp_is_post_autosave($post_id) || wp_is_post_revision($post_id) || !in_array($post->post_status, ['publish', 'inherit'], true)) return;
		if (!wp_next_scheduled('seo_studio_sync_post', [(int) $post_id])) wp_schedule_single_event(time() + 15, 'seo_studio_sync_post', [(int) $post_id]);
	}

	public static function schedule_post_transition($new_status, $old_status, $post) {
		if (!$post || wp_is_post_autosave($post->ID) || wp_is_post_revision($post->ID) || $new_status === $old_status) return;
		if (!wp_next_scheduled('seo_studio_sync_post', [(int) $post->ID])) wp_schedule_single_event(time() + 15, 'seo_studio_sync_post', [(int) $post->ID]);
	}

	public static function sync_post_to_app($post_id) {
		$post = get_post(absint($post_id));
		$app_url = untrailingslashit(esc_url_raw(get_option('seo_studio_app_url', ''), ['https']));
		$token = self::get_app_token();
		if (!$post || !$app_url || !preg_match('/^sseo_[A-Za-z0-9_-]{40,60}$/', $token)) return;
		$result = self::push_post_to_app($post, in_array($post->post_status, ['publish', 'inherit'], true) ? 'publish' : 'private');
		$state = get_option(self::SYNC_STATE_OPTION, []);
		$state = is_array($state) && (int) ($state['postId'] ?? 0) === (int) $post->ID ? $state : [];
		if ($result['ok']) {
			update_option(self::SYNC_STATE_OPTION, ['status' => 'connected', 'postId' => (int) $post->ID, 'attempts' => 0, 'httpStatus' => $result['httpStatus'], 'lastAttemptAt' => time(), 'lastSuccessAt' => time()], false);
			wp_clear_scheduled_hook('seo_studio_retry_sync_post', [(int) $post->ID]);
			return;
		}
		$attempts = (int) ($state['attempts'] ?? 0) + 1;
		$status = $attempts >= 5 || !$result['retryable'] ? 'failed' : 'retrying';
		update_option(self::SYNC_STATE_OPTION, ['status' => $status, 'postId' => (int) $post->ID, 'attempts' => $attempts, 'httpStatus' => $result['httpStatus'], 'lastAttemptAt' => time()], false);
		if ($status === 'retrying' && !wp_next_scheduled('seo_studio_retry_sync_post', [(int) $post->ID])) {
			$delay = min(HOUR_IN_SECONDS, 60 * (2 ** min(5, $attempts - 1)));
			wp_schedule_single_event(time() + $delay, 'seo_studio_retry_sync_post', [(int) $post->ID]);
		}
	}

	public static function sync_deleted_post($post_id, $post = null) {
		$post = $post ?: get_post(absint($post_id));
		if (!$post) return;
		self::push_post_to_app($post, 'deleted');
	}

	private static function push_post_to_app($post, $status) {
		$app_url = untrailingslashit(esc_url_raw(get_option('seo_studio_app_url', ''), ['https']));
		$token = self::get_app_token();
		if (!$app_url || !preg_match('/^sseo_[A-Za-z0-9_-]{40,60}$/', $token)) return ['ok' => false, 'retryable' => false, 'httpStatus' => 0];
		$body = [
			'siteUrl' => home_url('/'), 'pluginVersion' => self::VERSION,
			'posts' => [[
				'postId' => (int) $post->ID, 'postType' => $post->post_type,
				'title' => get_the_title($post), 'url' => get_permalink($post), 'status' => 'publish',
				'meta' => [
					'title' => self::sync_meta($post->ID, 'title'),
					'description' => self::sync_meta($post->ID, 'description'),
					'canonical' => self::sync_meta($post->ID, 'canonical'),
					'robots' => self::sync_meta($post->ID, 'robots'),
				],
			]],
		];
		$body['posts'][0]['status'] = $status;
		$response = wp_remote_post($app_url . '/api/plugin/v1/sync', [
			'timeout' => 15,
			'redirection' => 0,
			'headers' => ['Authorization' => 'Bearer ' . $token, 'Content-Type' => 'application/json', 'Accept' => 'application/json'],
			'body' => wp_json_encode($body),
		]);
		if (is_wp_error($response)) return ['ok' => false, 'retryable' => true, 'httpStatus' => 0];
		$http_status = (int) wp_remote_retrieve_response_code($response);
		return ['ok' => $http_status >= 200 && $http_status < 300, 'retryable' => $http_status === 429 || $http_status >= 500, 'httpStatus' => $http_status];
	}

	public static function register_routes() {
		register_rest_route('seo-studio/v1', '/connection', ['methods' => 'GET', 'permission_callback' => static function () { return current_user_can('manage_options'); }, 'callback' => [__CLASS__, 'connection']]);
		register_rest_route('seo-studio/v1', '/content-types', ['methods' => 'GET', 'permission_callback' => static function () { return current_user_can('edit_posts'); }, 'callback' => [__CLASS__, 'content_types']]);
		register_rest_route('seo-studio/v1', '/content', ['methods' => 'GET', 'permission_callback' => static function () { return current_user_can('edit_posts'); }, 'callback' => [__CLASS__, 'content']]);
		register_rest_route('seo-studio/v1', '/bulk/preview', ['methods' => 'POST', 'permission_callback' => static function () { return current_user_can('edit_posts'); }, 'callback' => [__CLASS__, 'bulk_preview']]);
		register_rest_route('seo-studio/v1', '/bulk/update', ['methods' => 'POST', 'permission_callback' => static function () { return current_user_can('edit_posts'); }, 'callback' => [__CLASS__, 'bulk_update']]);
		register_rest_route('seo-studio/v1', '/app/metadata', ['methods' => 'POST', 'permission_callback' => [__CLASS__, 'app_permission'], 'callback' => [__CLASS__, 'app_update_metadata']]);
		register_rest_route('seo-studio/v1', '/sitemap', ['methods' => 'GET', 'permission_callback' => [__CLASS__, 'app_permission'], 'callback' => [__CLASS__, 'sitemap_status']]);
		register_rest_route('seo-studio/v1', '/sitemap', ['methods' => 'POST', 'permission_callback' => [__CLASS__, 'app_permission'], 'callback' => [__CLASS__, 'update_sitemap']]);
		register_rest_route('seo-studio/v1', '/redirects', ['methods' => 'GET', 'permission_callback' => static function () { return current_user_can('manage_options'); }, 'callback' => [__CLASS__, 'list_redirects']]);
		register_rest_route('seo-studio/v1', '/redirects', ['methods' => 'POST', 'permission_callback' => static function () { return current_user_can('manage_options'); }, 'callback' => [__CLASS__, 'save_redirect']]);
	}

	public static function app_permission($request) {
		$token = (string) $request->get_header('authorization');
		$token = preg_match('/^Bearer\s+(sseo_[A-Za-z0-9_-]{40,60})$/', $token, $matches) ? $matches[1] : '';
		$saved = self::get_app_token();
		return $token !== '' && $saved !== '' && hash_equals($saved, $token);
	}

	public static function app_update_metadata($request) {
		$post_id = absint($request->get_param('postId'));
		$post = $post_id ? get_post($post_id) : null;
		if (!$post || $post->post_status !== 'publish' || !is_post_type_viewable($post->post_type)) return new WP_Error('invalid_content', __('Only published, publicly viewable content can be changed from SEO Studio.', 'seo-studio'), ['status' => 404]);
		$metadata = $request->get_param('metadata');
		if (!is_array($metadata) || !$metadata || count($metadata) > 6) return new WP_Error('invalid_metadata', __('Provide one or more supported metadata fields.', 'seo-studio'), ['status' => 400]);
		$fields = [
			'title' => [self::META_TITLE, 300],
			'description' => [self::META_DESCRIPTION, 500],
			'canonical' => [self::META_CANONICAL, 2048],
			'robots' => [self::META_ROBOTS, 100],
			'schema' => [self::META_SCHEMA, 20000],
			'altText' => [self::META_IMAGE_ALT, 300],
		];
		$updated = [];
		foreach ($metadata as $name => $raw) {
			if (!isset($fields[$name]) || !is_string($raw)) continue;
			[$key, $limit] = $fields[$name];
			if ($name === 'altText' && $post->post_type !== 'attachment') continue;
			$value = $name === 'canonical' ? esc_url_raw($raw, ['http', 'https']) : sanitize_text_field($raw);
			if ($name === 'schema') {
				$decoded = json_decode($raw);
				if (json_last_error() !== JSON_ERROR_NONE || (!is_array($decoded) && !is_object($decoded))) return new WP_Error('invalid_schema', __('Schema must be valid JSON.', 'seo-studio'), ['status' => 400]);
				$value = wp_json_encode($decoded, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
			}
			$value = function_exists('mb_substr') ? mb_substr($value, 0, $limit) : substr($value, 0, $limit);
			$before = get_post_meta($post_id, $key, true);
			self::record_change($post_id, $key, $before, $value, 'seo_studio_app');
			update_post_meta($post_id, $key, $value);
			$updated[$name] = $value;
		}
		if (!$updated) return new WP_Error('no_fields_updated', __('No supported metadata fields were updated for this content.', 'seo-studio'), ['status' => 400]);
		return rest_ensure_response(['updated' => true, 'postId' => $post_id, 'fields' => $updated]);
	}

	public static function core_sitemaps_enabled($enabled) {
		if (self::has_external_sitemap_owner()) return $enabled;
		return get_option(self::SITEMAP_OPTION, 'default') === 'disabled' ? false : (bool) $enabled;
	}

	private static function has_external_sitemap_owner() {
		if (self::has_seo_plugin()) return true;
		$known_plugins = array_merge((array) get_option('active_plugins', []), array_keys((array) get_site_option('active_sitewide_plugins', [])));
		foreach ($known_plugins as $plugin) {
			if (preg_match('/(?:wordpress-seo|seo-by-rank-math|all-in-one-seo-pack|autodescription|wp-seopress|slim-seo|squirrly-seo)/i', (string) $plugin)) return true;
		}
		return false;
	}

	public static function sitemap_status() {
		$external_owner = self::has_external_sitemap_owner();
		$supported = function_exists('get_sitemap_url') && function_exists('wp_sitemaps_get_server');
		$public = (bool) get_option('blog_public', 1);
		$enabled = null;
		$url = null;
		$manager = $external_owner ? 'seo_plugin' : ($supported ? 'wordpress_core' : 'unsupported');
		if (!$external_owner && $supported) {
			$enabled = $public && get_option(self::SITEMAP_OPTION, 'default') !== 'disabled';
			if ($enabled) {
				$index_url = get_sitemap_url('index');
				$url = is_string($index_url) ? esc_url_raw($index_url, ['https']) : null;
			}
		}
		return rest_ensure_response(['manager' => $manager, 'enabled' => $enabled, 'blogPublic' => $public, 'sitemapUrl' => $url, 'pluginVersion' => self::VERSION]);
	}

	public static function update_sitemap($request) {
		if (self::has_external_sitemap_owner()) return new WP_Error('sitemap_managed_elsewhere', __('An SEO plugin owns this sitemap. Manage sitemap settings in that plugin; SEO Studio will not override it.', 'seo-studio'), ['status' => 409]);
		if (!function_exists('get_sitemap_url') || !function_exists('wp_sitemaps_get_server')) return new WP_Error('sitemap_unsupported', __('This WordPress version does not expose the core sitemap API.', 'seo-studio'), ['status' => 409]);
		$enabled = $request->get_param('enabled');
		if (!is_bool($enabled) || $request->get_param('approved') !== true) return new WP_Error('sitemap_confirmation_required', __('Confirm the reviewed sitemap setting change.', 'seo-studio'), ['status' => 400]);
		if ($enabled && !(bool) get_option('blog_public', 1)) return new WP_Error('site_not_public', __('WordPress is set to discourage search engines. Change the site visibility setting before enabling a sitemap.', 'seo-studio'), ['status' => 409]);
		update_option(self::SITEMAP_OPTION, $enabled ? 'enabled' : 'disabled', false);
		return self::sitemap_status();
	}

	public static function connection() {
		$active = array_merge((array) get_option('active_plugins', []), array_keys((array) get_site_option('active_sitewide_plugins', [])));
		$seo_plugins = array_values(array_filter(array_map('sanitize_text_field', $active), static function ($plugin) { return preg_match('/(?:wordpress-seo|seo-by-rank-math|all-in-one-seo|autodescription|wp-seopress|slim-seo|squirrly-seo)/i', $plugin) === 1; }));
		$sync = get_option(self::SYNC_STATE_OPTION, []);
		return rest_ensure_response(['connected' => true, 'pluginVersion' => self::VERSION, 'wordpressVersion' => get_bloginfo('version'), 'phpVersion' => PHP_VERSION, 'siteUrl' => home_url('/'), 'seoPluginConflict' => self::has_seo_plugin(), 'seoPlugins' => $seo_plugins, 'woocommerceAvailable' => class_exists('WooCommerce') && post_type_exists('product'), 'supportedPostTypes' => self::seo_post_types(), 'automaticSync' => is_array($sync) ? $sync : [], 'apiVersion' => 'v1']);
	}

	public static function content_types() {
		$result = [];
		foreach (self::seo_post_types() as $name) {
			$type = get_post_type_object($name);
			$taxonomies = [];
			foreach (get_object_taxonomies($name, 'objects') as $taxonomy) $taxonomies[] = ['name' => $taxonomy->name, 'label' => $taxonomy->label, 'hierarchical' => $taxonomy->hierarchical];
			$published = wp_count_posts($name);
			$result[] = ['name' => $name, 'label' => $type->label, 'taxonomies' => $taxonomies, 'count' => (int) ($published->publish ?? 0)];
		}
		return rest_ensure_response(['postTypes' => $result]);
	}

	public static function content($request) {
		$type = sanitize_key($request->get_param('postType'));
		if (!in_array($type, self::seo_post_types(), true)) return new WP_Error('invalid_post_type', __('Unsupported content type.', 'seo-studio'), ['status' => 400]);
		$page = max(1, absint($request->get_param('page') ?: 1));
		$posts = get_posts(['post_type' => $type, 'post_status' => $type === 'attachment' ? 'inherit' : ['publish', 'private'], 'posts_per_page' => 100, 'paged' => $page, 'orderby' => 'ID', 'order' => 'ASC']);
		$items = [];
		foreach ($posts as $post) {
			if (current_user_can('edit_post', $post->ID)) $items[] = ['id' => $post->ID, 'title' => get_the_title($post), 'url' => get_permalink($post), 'status' => $post->post_status];
		}
		return rest_ensure_response(['postType' => $type, 'page' => $page, 'items' => $items]);
	}

	private static function valid_bulk_request($request) {
		$type = sanitize_key($request->get_param('postType'));
		$field = sanitize_key($request->get_param('field'));
		$allowed = [self::META_TITLE, self::META_DESCRIPTION, self::META_CANONICAL, self::META_ROBOTS, self::META_SCHEMA, self::META_IMAGE_ALT];
		if (!in_array($type, self::seo_post_types(), true)) return new WP_Error('invalid_post_type', __('Unsupported content type.', 'seo-studio'), ['status' => 400]);
		if (!in_array($field, $allowed, true)) return new WP_Error('invalid_field', __('Unsupported metadata field.', 'seo-studio'), ['status' => 400]);
		$ids = array_slice(array_values(array_filter(array_map('absint', (array) $request->get_param('ids')))), 0, 100);
		$query = ['post_type' => $type, 'post_status' => $type === 'attachment' ? 'inherit' : ['publish', 'private'], 'posts_per_page' => 100, 'orderby' => 'ID', 'order' => 'ASC', 'fields' => 'ids'];
		if ($ids) $query['post__in'] = $ids;
		return [$type, $field, $ids, get_posts($query), (bool) $request->get_param('replace')];
	}

	private static function proposed_value($post_id, $field, $template) {
		$category = '';
		$terms = get_the_terms($post_id, 'category');
		if (is_array($terms) && $terms) $category = $terms[0]->name;
		$value = strtr((string) $template, ['{title}' => get_the_title($post_id), '{site_name}' => get_bloginfo('name'), '{category}' => $category, '{excerpt}' => wp_strip_all_tags(get_the_excerpt($post_id)), '{url}' => get_permalink($post_id)]);
		if ($field === self::META_CANONICAL) return esc_url_raw($value, ['http', 'https']);
		if ($field === self::META_SCHEMA) {
			$decoded = json_decode($value);
			return json_last_error() === JSON_ERROR_NONE && (is_array($decoded) || is_object($decoded)) ? $value : '';
		}
		return sanitize_text_field($value);
	}

	public static function bulk_preview($request) {
		$valid = self::valid_bulk_request($request);
		if (is_wp_error($valid)) return $valid;
		[$type, $field, $ids, $posts, $replace] = $valid;
		if (!$ids) return new WP_Error('ids_required', __('Choose content IDs before creating a bulk preview.', 'seo-studio'), ['status' => 400]);
		$template = $request->get_param('template');
		if (!is_string($template) || strlen($template) > 5000) return new WP_Error('invalid_template', __('Provide a template under 5,000 characters.', 'seo-studio'), ['status' => 400]);
		$rows = [];
		foreach ($posts as $post_id) {
			if (!current_user_can('edit_post', $post_id)) continue;
			$current = get_post_meta($post_id, $field, true);
			$proposed = self::proposed_value($post_id, $field, $template);
			$rows[] = ['id' => $post_id, 'title' => get_the_title($post_id), 'current' => $current, 'proposed' => ($current !== '' && !$replace) ? $current : $proposed, 'willChange' => ($current === '' || $replace) && $current !== $proposed];
		}
		$token = wp_generate_password(40, false, false);
		$fingerprint = hash('sha256', wp_json_encode([$type, $field, $ids, $template, $replace]));
		set_transient('seo_studio_bulk_' . $token, ['userId' => get_current_user_id(), 'fingerprint' => $fingerprint], 10 * MINUTE_IN_SECONDS);
		return rest_ensure_response(['postType' => $type, 'field' => $field, 'replaceExisting' => $replace, 'previewToken' => $token, 'expiresInSeconds' => 600, 'preview' => $rows]);
	}

	public static function bulk_update($request) {
		$valid = self::valid_bulk_request($request);
		if (is_wp_error($valid)) return $valid;
		[$type, $field, $ids, $posts, $replace] = $valid;
		if (!$ids) return new WP_Error('ids_required', __('Choose specific post IDs to update.', 'seo-studio'), ['status' => 400]);
		$template = $request->get_param('template');
		if (!is_string($template) || strlen($template) > 5000) return new WP_Error('invalid_template', __('Provide a template under 5,000 characters.', 'seo-studio'), ['status' => 400]);
		$token = sanitize_text_field((string) $request->get_param('previewToken'));
		$fingerprint = hash('sha256', wp_json_encode([$type, $field, $ids, $template, $replace]));
		$preview = $token ? get_transient('seo_studio_bulk_' . $token) : false;
		if (!$preview || (int) $preview['userId'] !== get_current_user_id() || !hash_equals((string) $preview['fingerprint'], $fingerprint)) return new WP_Error('preview_required', __('Run and review a matching bulk preview before applying changes.', 'seo-studio'), ['status' => 409]);
		delete_transient('seo_studio_bulk_' . $token);
		$updated = [];
		foreach ($posts as $post_id) {
			if (!current_user_can('edit_post', $post_id)) continue;
			$current = get_post_meta($post_id, $field, true);
			if ($current !== '' && !$replace) continue;
			$value = self::proposed_value($post_id, $field, $template);
			if ($field === self::META_SCHEMA && !$value) continue;
			self::record_change($post_id, $field, $current, $value, 'bulk_editor');
			update_post_meta($post_id, $field, $value);
			$updated[] = $post_id;
		}
		return rest_ensure_response(['updatedCount' => count($updated), 'updatedIds' => $updated, 'preservedExistingValues' => !$replace]);
	}

	public static function list_redirects() { return rest_ensure_response(get_option(self::REDIRECT_OPTION, [])); }

	public static function save_redirect($request) {
		$source = '/' . trim(sanitize_text_field((string) $request->get_param('source')), '/');
		$target = esc_url_raw((string) $request->get_param('target'), ['http', 'https']);
		$code = absint($request->get_param('status') ?: 301);
		if ($source === '/' || !$target || !in_array($code, [301, 302, 307, 308], true)) return new WP_Error('invalid_redirect', __('Provide a source path, HTTP(S) target and supported redirect status.', 'seo-studio'), ['status' => 400]);
		$redirects = get_option(self::REDIRECT_OPTION, []);
		$redirects[$source] = ['target' => $target, 'status' => $code];
		update_option(self::REDIRECT_OPTION, $redirects, false);
		return rest_ensure_response(['saved' => true, 'source' => $source, 'target' => $target, 'status' => $code]);
	}

	public static function maybe_redirect() {
		$path = '/' . trim((string) wp_parse_url(add_query_arg([]), PHP_URL_PATH), '/');
		$redirects = get_option(self::REDIRECT_OPTION, []);
		if (!isset($redirects[$path]) || !is_array($redirects[$path])) return;
		$target = $redirects[$path]['target'] ?? '';
		$code = absint($redirects[$path]['status'] ?? 301);
		if (wp_safe_redirect($target, in_array($code, [301, 302, 307, 308], true) ? $code : 301, 'SEO Studio')) exit;
	}
}

SEO_Studio_Connector::init();
