import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-28">
        <article className="prose prose-invert prose-sm max-w-none [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-10 [&_h2]:mb-4 [&_p]:text-text-secondary [&_p]:leading-relaxed [&_li]:text-text-secondary [&_a]:text-brand [&_a]:no-underline [&_a]:hover:underline">
          {children}
        </article>
      </main>
      <Footer />
    </>
  );
}
