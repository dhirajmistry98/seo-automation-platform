=== SEO Studio Connector ===
Contributors: seostudio
Tags: seo, metadata, bulk editor, canonical, schema
Requires at least: 6.2
Requires PHP: 8.0
Stable tag: 0.5.0
License: GPLv2 or later

SEO metadata controls and a permission-checked REST API for SEO Studio.

== Installation ==

Copy the seo-studio folder into wp-content/plugins and activate SEO Studio Connector. For remote REST use, create a dedicated WordPress user with only the content permissions needed, then create an Application Password for that user over HTTPS. The REST API follows WordPress authentication and capability checks; the application password is never stored by this plugin.

== Features ==

* Edit SEO title, meta description, canonical URL, robots directives and JSON-LD on public post types.
* Stores metadata in WordPress post meta and exposes it through the WordPress REST API.
* Provides `/wp-json/seo-studio/v1/connection`, `/content-types`, and `/content` endpoints.
* Provides a bulk preview and apply workflow for up to 100 selected records per update. A preview token expires after ten minutes and is bound to its owner and exact change set.
* Existing field values are preserved unless `replace` is explicitly selected.
* Supports `{title}`, `{site_name}`, `{category}`, `{excerpt}` and `{url}` in metadata templates.
* Records editor, app-initiated and bulk changes in per-post `_seo_studio_change_history` metadata.
* Provides a site-token authenticated `/wp-json/seo-studio/v1/app/metadata` endpoint for SEO Studio to apply a user-approved metadata update to published content.
* Provides redirect list and creation endpoints for administrators.
* Provides a site-token authenticated sitemap status/control endpoint for WordPress core. It refuses to change settings when a known SEO plugin owns sitemap output.
* Detects common SEO plugin conflicts and reports active integrations rather than claiming universal compatibility. Front-end metadata filters are provided for Yoast SEO, Rank Math, AIOSEO and SEOPress. Slim SEO and Squirrly are detected as possible conflicts, but their metadata output is not directly adapted.
* Automatically retries transient per-post sync errors with bounded exponential backoff and records a visible connection health state.
* Reports WordPress/PHP versions, WooCommerce availability, public content types and per-post automatic sync health from the connection diagnostics.

== REST endpoints ==

* `GET /wp-json/seo-studio/v1/connection` (manage_options)
* `GET /wp-json/seo-studio/v1/content-types` (edit_posts)
* `GET /wp-json/seo-studio/v1/content?postType=post&page=1` (edit_posts)
* `POST /wp-json/seo-studio/v1/bulk/preview` (edit_posts)
* `POST /wp-json/seo-studio/v1/bulk/update` (edit_posts; requires the matching previewToken)
* `POST /wp-json/seo-studio/v1/app/metadata` (site connection token; accepts published post metadata changes from SEO Studio)
* `GET|POST /wp-json/seo-studio/v1/sitemap` (site connection token; manages only WordPress core sitemaps and requires explicit confirmation to change)
* `GET|POST /wp-json/seo-studio/v1/redirects` (manage_options)

Use a dedicated WordPress administrator to enter the app URL and the one-time token generated from the verified website in the SEO Studio dashboard. The plugin stores the token in its WordPress options, sends published content and SEO metadata to the authenticated app sync API when an administrator starts a bulk sync, and queues an incremental sync when a post is saved or changes status. Deletion sends a tombstone so the app no longer treats that record as published. Rotating the app token revokes the prior value. SEO Studio encrypts a server-side copy of the token only when `WORDPRESS_TOKEN_ENCRYPTION_KEY` is configured; rotate the website token after adding that key before using app-initiated metadata changes.
