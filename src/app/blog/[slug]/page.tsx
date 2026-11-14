import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { BlogHeader, JsonLd } from "@/components/blog/blog-chrome";
import { BlogBody, plainText } from "@/components/blog/rich-text";
import { SiteFooter } from "@/components/marketing/homepage-sections";
import { BLOG_AUTHOR, BLOG_POSTS, formatDate, getPost, readingMinutes, relatedPosts, tableOfContents } from "@/lib/blog";
import { siteUrl } from "@/lib/site-url";
import "../blog.css";

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Article not found | SEO STUDIO" };
  const url = `/blog/${post.slug}`;
  return {
    metadataBase: new URL(siteUrl()),
    // Keep the <title> within 60 characters so search results do not truncate it; drop the brand suffix when it would not fit.
    title: `${post.metaTitle} | SEO STUDIO`.length <= 60 ? `${post.metaTitle} | SEO STUDIO` : post.metaTitle,
    description: post.description,
    keywords: post.keywords,
    authors: [{ name: BLOG_AUTHOR.name }],
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: post.title,
      description: post.description,
      siteName: "SEO STUDIO",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      section: post.category,
      tags: post.keywords,
    },
    twitter: { card: "summary", title: post.title, description: post.description },
  };
}

export default async function BlogPostPage({ params }: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const origin = siteUrl();
  const url = `${origin}/blog/${post.slug}`;
  const toc = tableOfContents(post);
  const related = relatedPosts(post);
  const minutes = readingMinutes(post);

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      url,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      articleSection: post.category,
      keywords: post.keywords.join(", "),
      inLanguage: "en",
      timeRequired: `PT${minutes}M`,
      author: { "@type": "Organization", name: BLOG_AUTHOR.name, url: `${origin}${BLOG_AUTHOR.url}` },
      publisher: { "@type": "Organization", name: "SEO STUDIO", url: origin, logo: { "@type": "ImageObject", url: `${origin}/seo-studio-icon.png` } },
      image: `${origin}/seo-studio-icon.png`,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${origin}/blog` },
        { "@type": "ListItem", position: 3, name: post.title, item: url },
      ],
    },
    ...(post.faqs.length ? [{
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: post.faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: plainText(faq.answer) } })),
    }] : []),
  ];

  return <>
    <a href="#article" className="skip-link">Skip to article</a>
    <BlogHeader />
    <main className="blog-page blog-article-page">
      <JsonLd data={structuredData} />
      <nav className="blog-breadcrumb" aria-label="Breadcrumb"><Link href="/">SEO STUDIO</Link><span aria-hidden="true">/</span><Link href="/blog">Blog</Link><span aria-hidden="true">/</span><span>{post.category}</span></nav>

      <div className="blog-article-layout">
        <article id="article" className="blog-article">
          <header className="blog-article-header">
            <span className="blog-tag">{post.category}</span>
            <h1>{post.title}</h1>
            <p className="blog-lead">{post.description}</p>
            <p className="blog-meta">By {BLOG_AUTHOR.name} · <time dateTime={post.updatedAt}>Updated {formatDate(post.updatedAt)}</time> · <Clock size={13} aria-hidden="true" /> {minutes} min read</p>
          </header>

          <section className="blog-takeaways" aria-labelledby="takeaways-title">
            <h2 id="takeaways-title">Key takeaways</h2>
            <ul>{post.takeaways.map((item) => <li key={item}><CheckCircle2 size={15} aria-hidden="true" />{item}</li>)}</ul>
          </section>

          <div className="blog-prose"><BlogBody blocks={post.body} /></div>

          {post.faqs.length > 0 && <section className="blog-faq" aria-labelledby="faq-title">
            <h2 id="faq-title">Frequently asked questions</h2>
            {post.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}
          </section>}

          <aside className="blog-cta">
            <div><h2>Run this with SEO Studio</h2><p>Crawl-based audits, PageSpeed reports, keyword and rank research for any country, and GEO readiness checks — in one workspace.</p></div>
            <Link href="/login" className="blog-cta-button">Get started <ArrowRight size={15} aria-hidden="true" /></Link>
          </aside>
        </article>

        {toc.length > 0 && <aside className="blog-toc" aria-label="On this page">
          <strong>On this page</strong>
          <ol>{toc.map((item) => <li key={item.id}><a href={`#${item.id}`}>{item.text}</a></li>)}</ol>
        </aside>}
      </div>

      {related.length > 0 && <section className="blog-related" aria-labelledby="related-title">
        <h2 id="related-title">Keep reading</h2>
        <div className="blog-grid">{related.map((item) => <Link key={item.slug} href={`/blog/${item.slug}`} className="blog-card">
          <span className="blog-tag">{item.category}</span>
          <h3>{item.title}</h3>
          <p>{item.excerpt}</p>
          <span className="blog-meta"><Clock size={13} aria-hidden="true" /> {readingMinutes(item)} min read</span>
        </Link>)}</div>
        <Link href="/blog" className="blog-back-link"><ArrowLeft size={14} aria-hidden="true" /> All articles</Link>
      </section>}
    </main>
    <SiteFooter />
  </>;
}
