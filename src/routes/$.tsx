import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPublishedSite } from "@/lib/public-sites.functions";

export const Route = createFileRoute("/$")({
  loader: async ({ params }) => {
    const slug = params._splat ?? "";
    const site = await getPublishedSite({ data: { slug } });
    if (!site) throw notFound();
    return site;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.title ?? "Objavljena stranica" },
      { name: "description", content: `Objavljena Nova stranica: ${loaderData?.title ?? "web stranica"}.` },
    ],
  }),
  component: PublishedSitePage,
  errorComponent: () => <NotFound />,
  notFoundComponent: NotFound,
});

function PublishedSitePage() {
  const site = Route.useLoaderData();
  return (
    <iframe
      title={site.title}
      srcDoc={site.html}
      className="fixed inset-0 h-screen w-screen border-0 bg-background"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    />
  );
}

function NotFound() {
  return (
    <main className="min-h-screen grid place-items-center bg-background text-foreground p-6">
      <div className="text-center max-w-sm">
        <h1 className="text-3xl mb-2">Stranica nije pronađena</h1>
        <p className="text-sm text-muted-foreground">Provjeri ime objavljene stranice ili je ponovno hostaj iz Nova studija.</p>
      </div>
    </main>
  );
}