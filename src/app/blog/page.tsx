import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Clock } from "lucide-react";
import { BlogHeader, JsonLd } from "@/components/blog/blog-chrome";
import { SiteFooter } from "@/components/marketing/homepage-sections";
import { BLOG_CATEGORIES, BLOG_POSTS, formatDate, readingMinutes } from "@/lib/blog";
import { siteUrl } from "@/lib/site-url";
import "./blog.css";

const title = "SEO Studio Blog: Guides to Audits, Rankings, AI Search and More";
const description = "Step-by-step SEO Studio guides: technical SEO audits, page speed, keyword research and rank tracking in any country, AI search (GEO) readiness, WordPress and influencer marketing.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: `${title} | SEO STUDIO`,
  description,
  alternates: { canonical: "/blog" },
  openGraph: { type: "website", url: "/blog", title, description, siteName: "SEO STUDIO" },
  twitter: { card: "summary", title, description },
};

const categoryId = (category: string) => category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function BlogIndexPage() {
  const origin = siteUrl();
  const [featured, ...rest] = BLOG_POSTS;
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "SEO STUDIO Blog",
      description,
      url: `${origin}/blog`,
      publisher: { "@type": "Organization", name: "SEO STUDIO", url: origin, logo: `${origin}/seo-studio-icon.png` },
      blogPost: BLOG_POSTS.map((post) => ({ "@type": "BlogPosting", headline: post.title, url: `${origin}/blog/${post.slug}`, datePublished: post.publishedAt, dateModified: post.updatedAt })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${origin}/blog` },
      ],
    },
  ];

  return <>
    <a href="#blog-content" className="skip-link">Skip to articles</a>
    <BlogHeader />
    <main id="blog-content" className="blog-page">
      <JsonLd data={structuredData} />
      <header className="blog-hero">
        <nav className="blog-breadcrumb" aria-label="Breadcrumb"><Link href="/">SEO STUDIO</Link><span aria-hidden="true">/</span><span>Blog</span></nav>
        <p className="blog-eyebrow"><BookOpen size={14} aria-hidden="true" /> SEO STUDIO GUIDES</p>
        <h1>Get more from SEO Studio, step by step</h1>
        <p className="blog-lead">Practical walkthroughs of every SEO Studio feature: audit your site, speed it up, research and track rankings in any country, get ready for AI search, connect Google and WordPress, and work with creators.</p>
        <nav className="blog-category-nav" aria-label="Categories">
          {BLOG_CATEGORIES.map((category) => <a key={category} href={`#${categoryId(category)}`}>{category}</a>)}
        </nav>
      </header>

      {featured && <section className="blog-featured" aria-label="Start here">
        <Link href={`/blog/${featured.slug}`} className="blog-featured-card">
          <span className="blog-tag">Start here · {featured.category}</span>
          <h2>{featured.title}</h2>
          <p>{featured.excerpt}</p>
          <span className="blog-meta"><Clock size={13} aria-hidden="true" /> {readingMinutes(featured)} min read · {formatDate(featured.updatedAt)}</span>
          <span className="blog-read-link">Read the guide <ArrowRight size={14} aria-hidden="true" /></span>
        </Link>
      </section>}

      <section className="blog-grid-section" aria-label="All articles">
        <div className="blog-grid">
          {rest.map((post) => <Link key={post.slug} href={`/blog/${post.slug}`} className="blog-card">
            <span className="blog-tag">{post.category}</span>
            <h2>{post.title}</h2>
            <p>{post.excerpt}</p>
            <span className="blog-meta"><Clock size={13} aria-hidden="true" /> {readingMinutes(post)} min read</span>
          </Link>)}
        </div>
      </section>

      <section className="blog-topics" aria-label="Browse by topic">
        {BLOG_CATEGORIES.map((category) => {
          const posts = BLOG_POSTS.filter((post) => post.category === category);
          if (!posts.length) return null;
          return <div key={category} id={categoryId(category)} className="blog-topic">
            <h2>{category}</h2>
            <ul>{posts.map((post) => <li key={post.slug}><Link href={`/blog/${post.slug}`}>{post.title}</Link></li>)}</ul>
          </div>;
        })}
      </section>

      <aside className="blog-cta">
        <div><h2>Put these guides into practice</h2><p>Audit your site, research keywords in any country and language, and check AI-search readiness in one workspace.</p></div>
        <Link href="/login" className="blog-cta-button">Start with SEO Studio <ArrowRight size={15} aria-hidden="true" /></Link>
      </aside>
    </main>
    <SiteFooter />
  </>;
}
