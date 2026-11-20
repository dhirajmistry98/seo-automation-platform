"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy } from "lucide-react";

type SchemaType = "Article" | "FAQPage" | "Product" | "LocalBusiness" | "Organization" | "BreadcrumbList" | "Event" | "Review";

const SCHEMA_TYPES: Array<{ id: SchemaType; label: string; description: string }> = [
  { id: "Article", label: "Article", description: "Blog post, news article, or editorial content" },
  { id: "FAQPage", label: "FAQ Page", description: "Page containing frequently asked questions" },
  { id: "Product", label: "Product", description: "A product or service with price and reviews" },
  { id: "LocalBusiness", label: "Local Business", description: "Physical business with address and hours" },
  { id: "Organization", label: "Organization", description: "Company or brand identity signals" },
  { id: "BreadcrumbList", label: "Breadcrumbs", description: "Navigational hierarchy for SERP breadcrumbs" },
  { id: "Event", label: "Event", description: "In-person or online event with date and location" },
  { id: "Review", label: "Review / Rating", description: "A review of a product, service, or place" },
];

type Fields = Record<string, string>;

function buildSchema(type: SchemaType, f: Fields): object {
  switch (type) {
    case "Article":
      return {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: f.headline || "Article Headline",
        description: f.description || "A brief description of the article.",
        author: { "@type": "Person", name: f.authorName || "Author Name", url: f.authorUrl || "https://example.com/about" },
        publisher: { "@type": "Organization", name: f.publisherName || "Publisher Name", logo: { "@type": "ImageObject", url: f.publisherLogo || "https://example.com/logo.png" } },
        datePublished: f.datePublished || new Date().toISOString().split("T")[0],
        dateModified: f.dateModified || new Date().toISOString().split("T")[0],
        image: f.image || "https://example.com/article-image.jpg",
        url: f.url || "https://example.com/article",
        mainEntityOfPage: { "@type": "WebPage", "@id": f.url || "https://example.com/article" },
      };
    case "FAQPage":
      return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: (f.faqs || "Question 1|Answer 1\nQuestion 2|Answer 2").split("\n").filter(Boolean).map((line) => {
          const [q, a] = line.split("|");
          return { "@type": "Question", name: (q || "").trim(), acceptedAnswer: { "@type": "Answer", text: (a || "").trim() } };
        }),
      };
    case "Product":
      return {
        "@context": "https://schema.org",
        "@type": "Product",
        name: f.name || "Product Name",
        description: f.description || "Product description.",
        image: f.image || "https://example.com/product.jpg",
        sku: f.sku || "SKU-001",
        brand: { "@type": "Brand", name: f.brand || "Brand Name" },
        offers: { "@type": "Offer", price: f.price || "99.00", priceCurrency: f.currency || "INR", availability: "https://schema.org/InStock", url: f.url || "https://example.com/product" },
        aggregateRating: f.ratingValue ? { "@type": "AggregateRating", ratingValue: f.ratingValue, reviewCount: f.reviewCount || "1" } : undefined,
      };
    case "LocalBusiness":
      return {
        "@context": "https://schema.org",
        "@type": f.businessType || "LocalBusiness",
        name: f.name || "Business Name",
        description: f.description || "What this business does.",
        url: f.url || "https://example.com",
        telephone: f.telephone || "+91-00000-00000",
        address: { "@type": "PostalAddress", streetAddress: f.street || "123 Main Street", addressLocality: f.city || "Mumbai", addressRegion: f.state || "MH", postalCode: f.postalCode || "400001", addressCountry: f.country || "IN" },
        openingHoursSpecification: (f.hours || "Monday-Friday 09:00-18:00").split("\n").filter(Boolean).map((h) => ({ "@type": "OpeningHoursSpecification", description: h.trim() })),
        image: f.image || "https://example.com/storefront.jpg",
        priceRange: f.priceRange || "₹₹",
      };
    case "Organization":
      return {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: f.name || "Organization Name",
        url: f.url || "https://example.com",
        logo: f.logo || "https://example.com/logo.png",
        description: f.description || "What this organization does.",
        sameAs: (f.sameAs || "").split("\n").map((s) => s.trim()).filter(Boolean),
        contactPoint: f.contactEmail ? { "@type": "ContactPoint", email: f.contactEmail, contactType: "customer support" } : undefined,
        foundingDate: f.foundingDate || undefined,
      };
    case "BreadcrumbList":
      return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: (f.crumbs || "Home|https://example.com\nCategory|https://example.com/category\nPage|https://example.com/category/page").split("\n").filter(Boolean).map((line, i) => {
          const [name, url] = line.split("|");
          return { "@type": "ListItem", position: i + 1, name: (name || "").trim(), item: (url || "").trim() };
        }),
      };
    case "Event":
      return {
        "@context": "https://schema.org",
        "@type": "Event",
        name: f.name || "Event Name",
        description: f.description || "Event description.",
        startDate: f.startDate || "2025-01-01T09:00:00",
        endDate: f.endDate || "2025-01-01T18:00:00",
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: f.online === "true" ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
        location: f.online === "true"
          ? { "@type": "VirtualLocation", url: f.url || "https://example.com/event" }
          : { "@type": "Place", name: f.venueName || "Venue Name", address: { "@type": "PostalAddress", streetAddress: f.street || "123 Street", addressLocality: f.city || "Mumbai" } },
        organizer: { "@type": "Organization", name: f.organizer || "Organizer Name", url: f.url || "https://example.com" },
        offers: f.price ? { "@type": "Offer", price: f.price, priceCurrency: f.currency || "INR", url: f.url || "https://example.com/event" } : undefined,
      };
    case "Review":
      return {
        "@context": "https://schema.org",
        "@type": "Review",
        name: f.reviewName || "Review Title",
        reviewBody: f.reviewBody || "Review content.",
        author: { "@type": "Person", name: f.authorName || "Reviewer Name" },
        itemReviewed: { "@type": f.itemType || "Product", name: f.itemName || "Item Being Reviewed" },
        reviewRating: { "@type": "Rating", ratingValue: f.ratingValue || "5", bestRating: "5", worstRating: "1" },
        datePublished: f.datePublished || new Date().toISOString().split("T")[0],
        publisher: f.publisherName ? { "@type": "Organization", name: f.publisherName } : undefined,
      };
  }
}

const FIELD_DEFS: Record<SchemaType, Array<{ key: string; label: string; type?: "textarea" | "text"; placeholder: string; hint?: string }>> = {
  Article: [
    { key: "headline", label: "Headline", placeholder: "Article headline (60 chars max)" },
    { key: "description", label: "Description", placeholder: "Brief article summary" },
    { key: "url", label: "Page URL", placeholder: "https://example.com/article" },
    { key: "image", label: "Image URL", placeholder: "https://example.com/article.jpg" },
    { key: "authorName", label: "Author name", placeholder: "Jane Smith" },
    { key: "authorUrl", label: "Author profile URL", placeholder: "https://example.com/about/jane" },
    { key: "publisherName", label: "Publisher name", placeholder: "My Website" },
    { key: "publisherLogo", label: "Publisher logo URL", placeholder: "https://example.com/logo.png" },
    { key: "datePublished", label: "Date published", placeholder: "2025-01-15" },
    { key: "dateModified", label: "Date modified", placeholder: "2025-06-01" },
  ],
  FAQPage: [
    { key: "faqs", label: "Questions & Answers", type: "textarea", placeholder: "Question 1|Answer 1\nQuestion 2|Answer 2", hint: "One pair per line, separated by |" },
  ],
  Product: [
    { key: "name", label: "Product name", placeholder: "Product Name" },
    { key: "description", label: "Description", placeholder: "What this product does" },
    { key: "url", label: "Product URL", placeholder: "https://example.com/product" },
    { key: "image", label: "Image URL", placeholder: "https://example.com/product.jpg" },
    { key: "brand", label: "Brand name", placeholder: "Brand Name" },
    { key: "sku", label: "SKU", placeholder: "SKU-001" },
    { key: "price", label: "Price", placeholder: "999.00" },
    { key: "currency", label: "Currency", placeholder: "INR" },
    { key: "ratingValue", label: "Average rating (optional)", placeholder: "4.5" },
    { key: "reviewCount", label: "Review count (optional)", placeholder: "128" },
  ],
  LocalBusiness: [
    { key: "name", label: "Business name", placeholder: "My Business" },
    { key: "businessType", label: "Schema type", placeholder: "Restaurant (or LocalBusiness)" },
    { key: "description", label: "Description", placeholder: "What this business does" },
    { key: "url", label: "Website URL", placeholder: "https://example.com" },
    { key: "telephone", label: "Phone number", placeholder: "+91-98765-43210" },
    { key: "street", label: "Street address", placeholder: "123 Main Street" },
    { key: "city", label: "City", placeholder: "Mumbai" },
    { key: "state", label: "State", placeholder: "MH" },
    { key: "postalCode", label: "Postal code", placeholder: "400001" },
    { key: "country", label: "Country code", placeholder: "IN" },
    { key: "hours", label: "Opening hours", type: "textarea", placeholder: "Monday-Friday 09:00-18:00\nSaturday 10:00-16:00", hint: "One rule per line" },
    { key: "priceRange", label: "Price range", placeholder: "₹₹" },
    { key: "image", label: "Business photo URL", placeholder: "https://example.com/storefront.jpg" },
  ],
  Organization: [
    { key: "name", label: "Organization name", placeholder: "My Company" },
    { key: "url", label: "Website URL", placeholder: "https://example.com" },
    { key: "logo", label: "Logo URL", placeholder: "https://example.com/logo.png" },
    { key: "description", label: "Description", placeholder: "What this organization does" },
    { key: "foundingDate", label: "Founding year (optional)", placeholder: "2020" },
    { key: "contactEmail", label: "Contact email (optional)", placeholder: "hello@example.com" },
    { key: "sameAs", label: "Social profiles", type: "textarea", placeholder: "https://twitter.com/handle\nhttps://linkedin.com/company/name", hint: "One URL per line" },
  ],
  BreadcrumbList: [
    { key: "crumbs", label: "Breadcrumb items", type: "textarea", placeholder: "Home|https://example.com\nCategory|https://example.com/category\nPage|https://example.com/category/page", hint: "Name|URL per line" },
  ],
  Event: [
    { key: "name", label: "Event name", placeholder: "Annual SEO Conference" },
    { key: "description", label: "Description", placeholder: "What this event is about" },
    { key: "url", label: "Event URL", placeholder: "https://example.com/event" },
    { key: "startDate", label: "Start date & time", placeholder: "2025-01-15T09:00:00" },
    { key: "endDate", label: "End date & time", placeholder: "2025-01-15T18:00:00" },
    { key: "organizer", label: "Organizer name", placeholder: "My Company" },
    { key: "online", label: "Online event?", placeholder: "true or false" },
    { key: "venueName", label: "Venue name (if offline)", placeholder: "Conference Centre" },
    { key: "street", label: "Street address (if offline)", placeholder: "123 Main Street" },
    { key: "city", label: "City (if offline)", placeholder: "Mumbai" },
    { key: "price", label: "Ticket price (optional)", placeholder: "999" },
    { key: "currency", label: "Currency (optional)", placeholder: "INR" },
  ],
  Review: [
    { key: "reviewName", label: "Review title", placeholder: "Great product!" },
    { key: "reviewBody", label: "Review text", type: "textarea", placeholder: "Full review content…" },
    { key: "authorName", label: "Reviewer name", placeholder: "Jane Smith" },
    { key: "ratingValue", label: "Rating (1–5)", placeholder: "5" },
    { key: "itemName", label: "Item being reviewed", placeholder: "Product or service name" },
    { key: "itemType", label: "Item type", placeholder: "Product (or Service, Book, Movie…)" },
    { key: "datePublished", label: "Date published", placeholder: "2025-01-15" },
    { key: "publisherName", label: "Publisher name (optional)", placeholder: "My Website" },
  ],
};

export default function SchemaGeneratorPage() {
  const [type, setType] = useState<SchemaType>("Article");
  const [fields, setFields] = useState<Fields>({});
  const [copied, setCopied] = useState(false);

  const schema = buildSchema(type, fields);
  // Remove undefined values for clean output
  const clean = JSON.parse(JSON.stringify(schema));
  const output = JSON.stringify(clean, null, 2);
  const snippet = `<script type="application/ld+json">\n${output}\n</script>`;

  const copy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="workspace-section">
      <header className="workspace-page-heading">
        <div>
          <p className="workspace-eyebrow"><span /> TOOLS</p>
          <h1>Schema Generator</h1>
          <p>Build JSON-LD structured data for any page and copy the ready-to-use HTML snippet.</p>
        </div>
        <Link href="/dashboard/tools" className="workspace-outline-link"><ArrowLeft size={14} /> All tools</Link>
      </header>

      <div className="schema-gen-layout">
        <div className="schema-gen-form">
          <div className="schema-type-grid">
            {SCHEMA_TYPES.map((s) => (
              <button key={s.id} className={`schema-type-btn${type === s.id ? " is-active" : ""}`} onClick={() => { setType(s.id); setFields({}); }}>
                <strong>{s.label}</strong>
                <span>{s.description}</span>
              </button>
            ))}
          </div>

          <div className="schema-fields">
            {FIELD_DEFS[type].map((f) => (
              <div key={f.key} className="ai-form-row">
                <label>{f.label}{f.hint && <small className="schema-hint"> — {f.hint}</small>}</label>
                {f.type === "textarea"
                  ? <textarea rows={4} placeholder={f.placeholder} value={fields[f.key] ?? ""} onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))} />
                  : <input type="text" placeholder={f.placeholder} value={fields[f.key] ?? ""} onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))} />
                }
              </div>
            ))}
          </div>
        </div>

        <div className="schema-gen-preview">
          <div className="schema-preview-header">
            <strong>Generated JSON-LD</strong>
            <button className={`workspace-outline-link schema-copy-btn${copied ? " is-copied" : ""}`} onClick={copy}>
              {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy snippet</>}
            </button>
          </div>
          <pre className="schema-preview-code">{snippet}</pre>
          <p className="schema-preview-hint">Paste this inside the <code>&lt;head&gt;</code> of your page.</p>
        </div>
      </div>
    </div>
  );
}
