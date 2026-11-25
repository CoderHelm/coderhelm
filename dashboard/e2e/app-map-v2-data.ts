// A made-up map shaped like a large team's real one, with the App map's
// newer fields (the graph contract's `level`, `evidence`, `inferred`,
// `screens[].nav` and `flows[]`): about 4,000 files over ten repositories, a
// phone app with about 140 screens (four of them signed out), about 15
// cloud resources and outside services, links found in the code and links
// inferred from names, env vars and infrastructure code, and four journeys
// (plus one hidden, which never shows). All names are made up.

type Node = Record<string, unknown> & { id: string; label: string; kind: string };
type Ev = { file: string; line: number; how: "code" | "inferred"; confidence: number };
type Link = { a: string; b: string; k: string; w: number; labels?: string[]; evidence?: Ev[]; inferred?: boolean; calls?: [number, number][] };

const REPOS = ["site", "studio", "app", "app-cms", "server", "helpers", "pipelines", "screens", "devtools", "cloud"];

/** The phone app's screens: [name, group, signed out]. */
const SIGNED_OUT = ["Splash", "SignInLanding", "SignIn", "ForgotPassword"];
const AREAS: [string, string[]][] = [
  ["Profile", ["Profile", "EditProfile", "Schedule", "MonthView", "Credits", "Favorites", "Membership", "AccountDetails", "PasswordUpdate", "Support", "Notifications", "ExportData"]],
  ["Classes and events", ["Classes", "ClassDetail", "SeatPicker", "WalkIn", "CancelBooking", "IntroOffer", "ClassFilter", "Discover", "Events", "EventDetail"]],
  ["Payments and account", ["Payment", "PaymentMethods", "Balance", "DebtNotice", "DeleteAccount", "DeletionConfirmation"]],
  ["Buying and booking sessions", ["BuySessions", "SessionCredits", "SessionLocation", "Training", "TrainerDetail", "Massage", "Babysitting", "PunchCard"]],
  ["Locations", ["Locations", "LocationDetail", "Equipment", "AllAccess", "Hours"]],
  ["First-run onboarding", ["OnboardingSplash", "OnboardingGoals", "OnboardingInterests", "OnboardingDone"]],
  ["Membership freeze", ["FreezeStart", "FreezeDates", "FreezeConfirm"]],
];

export function v2Map() {
  const nodes: Node[] = [];
  const top = (id: string, label: string, kind: string, summary: string, level: string, repo?: string) =>
    nodes.push({ id, parent: null, label, kind, summary, details: "", tags: [], paths: repo ? [`${repo}/`] : [], packages: [], hosts: [], level, stats: { files: 0, loc: 0, langs: {}, repos: repo ? [repo] : [] } });
  top("web", "Website", "ui", "The public website where members find classes, book them and pay.", "system", "site");
  top("studio", "Website content editor", "ui", "Where staff write the website's pages and offers.", "system", "studio");
  top("mobile", "Fitness mobile app", "ui", "The phone app for bookings, check-in and the member card.", "system", "app");
  top("mobilecms", "Mobile app content editor", "ui", "Where staff write the screens and notices the app shows.", "system", "app-cms");
  top("display", "Class schedule display", "ui", "A screen listing upcoming classes at each location.", "system", "screens");
  top("api", "Main server", "service", "Takes every booking, payment and account request from the website and the app.", "system", "server");
  top("lambdas", "Image and video helpers", "worker", "Small cloud functions that resize images and make video previews.", "system", "helpers");
  top("data", "Analytics pipelines", "worker", "Scheduled data jobs that count bookings and visits.", "system", "pipelines");
  top("tools", "Developer tools", "library", "Scripts and helpers the team runs by hand.", "part", "devtools");
  top("infra", "Cloud setup", "infra", "The cloud hosting, set up as code.", "part", "cloud");
  // Cloud resources, inside the cloud setup, and outside services.
  const res = (id: string, label: string, kind: string, summary: string) =>
    nodes.push({ id, parent: "infra", label, kind, summary, details: "", tags: [], paths: [], packages: [], hosts: [], level: "system", stats: { files: 0, loc: 0, langs: {}, repos: [] } });
  res("cdn-images", "Image CDN", "infra", "A content delivery network in front of the image resizer's function address.");
  res("fn-resizer", "Image resizer function", "infra", "A cloud function with a public address; its code is deployed by a workflow.");
  res("svc-api", "Main server service", "infra", "The container service that runs the main server.");
  res("db", "Main database", "data", "Schedules, member profiles and checkouts.");
  res("cache", "Cache", "data", "Token checks and the schedule, kept close at hand.");
  res("search", "Search index", "data", "Class and schedule search.");
  res("bucket", "Video upload bucket", "data", "Where new videos land; a new one starts a preview job.");
  const ext = (id: string, label: string, summary: string) =>
    nodes.push({ id, parent: null, label, kind: "external", summary, details: "", tags: [], paths: [], packages: [], hosts: [], level: "system", vendor: label, how: "catalog", evidence: [], stats: { files: 0, loc: 0, langs: {}, repos: [] } });
  ext("members", "Member system", "People, bookings, subscriptions and payments.");
  ext("members-signin", "Member system sign-in API", "Checks passwords and issues sign-in tokens.");
  ext("crm", "CRM", "Leads, contacts and support tickets.");
  ext("mail", "Email service", "Email and push messages.");
  ext("mailcheck", "Email checker", "Checks that an email address is real.");
  ext("events", "Events service", "Event listings and tickets.");
  ext("leagues", "League schedules", "League and rink schedules.");
  ext("push", "Push messages", "Push notifications to the phone app.");

  // ---------- files ----------
  type File = { p: string; n: string; r: string; l: string; loc: number; name: string; d: string; s?: [string, string, number, number, string][] };
  const files: File[] = [];
  const file = (p: string, n: string, name: string, d: string, s?: File["s"]) => { files.push({ p, n, r: p.split("/")[0], l: p.endsWith(".py") ? "python" : p.endsWith(".tf") ? "hcl" : p.endsWith(".yml") ? "yaml" : "typescript", loc: 80, name, d, ...(s ? { s } : {}) }); return p; };
  const bulk = (n: string, repo: string, count: number, label: string, folders = 25) => {
    const out: string[] = [];
    for (let i = 0; i < count; i++) out.push(file(`${repo}/src/${n}/area${i % folders}/file${i}.ts`, n, `${label} file ${i}`, `Part of the ${label.toLowerCase()}: one screen, route or helper.`));
    return out;
  };
  const webFiles = bulk("web", "site", 1240, "Website");
  const imageLoader = file("site/image-loader.ts", "web", "Image loader", "Builds the address of a resized image.", [["imageLoader", "function", 12, 1, "Image address for a width"]]);
  const webSignInForm = file("site/src/features/join/SignInForm.tsx", "web", "Join sign-in form", "The sign-in step of the join drawer.");
  const webDrawer = file("site/src/features/join/JoinDrawer.tsx", "web", "Join drawer", "Holds the steps of joining online.", [["handleSignIn", "function", 88, 0, "Signs the member in"]]);
  const webSignIn = file("site/src/lib/sign-in.ts", "web", "Website sign-in", "Sends the email and password to the main server.", [["signIn", "function", 21, 1, "POST /member-signin/login"]]);
  const webSession = file("site/src/lib/member-session.ts", "web", "Member session", "Reads the member and sets the session cookie.", [["startSession", "function", 30, 1, ""]]);
  bulk("studio", "studio", 180, "Website content editor", 12);
  bulk("mobilecms", "app-cms", 80, "Mobile app content editor", 8);
  bulk("display", "screens", 40, "Class schedule display", 6);
  bulk("tools", "devtools", 260, "Developer tools", 14);
  const dataFiles = bulk("data", "pipelines", 300, "Analytics pipelines", 20);
  const schedulePipeline = file("pipelines/dags/schedule_pipeline.py", "data", "Schedule pipeline", "Copies the schedule from the member system into the main database.");
  const resizer = file("helpers/image-resizer/index.mjs", "lambdas", "Image resizer", "Resizes an image to the width asked for.", [["handler", "function", 9, 1, ""]]);
  const videoPreview = file("helpers/video-preview/index.mjs", "lambdas", "Video preview", "Makes a short preview of each new video.");
  file("helpers/shared/sizes.mjs", "lambdas", "Image sizes", "The widths the resizer makes.");
  const deployWorkflow = file("helpers/.github/workflows/deploy-resizer.yml", "lambdas", "Resizer deploy workflow", "Deploys the resizer's code to its function by name.");
  const tfResizer = file("cloud/modules/image-resizer/main.tf", "infra", "Image resizer module", "Defines the resizer function and its CDN.");
  const tfServer = file("cloud/modules/server/main.tf", "infra", "Main server module", "Defines the container service and its database.");
  for (let i = 0; i < 168; i++) file(`cloud/modules/area${i % 12}/file${i}.tf`, "infra", `Cloud setup file ${i}`, "A piece of the cloud setup.");
  // The main server: controllers with routes, services, and the rest.
  const apiFiles = bulk("api", "server", 880, "Main server", 22);
  const signinProxy = file("server/src/member-signin/signin-proxy.module.ts", "api", "Sign-in proxy", "Passes sign-in to the member system's sign-in API, for allowed paths only.", [["SigninProxyModule", "class", 14, 1, ""]]);
  const membersProxy = file("server/src/members/members.controller.ts", "api", "Member system pass-through", "Passes allowed member system calls through, checking the member owns the data.", [["MembersController", "class", 20, 1, ""]]);
  const membersClient = file("server/src/members/members-api.service.ts", "api", "Member system client", "Calls the member system's REST API.", [["MembersApiService", "class", 11, 1, ""]]);
  const profileCtl = file("server/src/profile/profile.controller.ts", "api", "Member profile", "Reads and updates the signed-in member's profile.", [["ProfileController", "class", 18, 1, ""]]);
  const ormConfig = file("server/ormconfig.ts", "api", "Database settings", "Connects to the main database from env vars.");
  const crmClient = file("server/src/crm/crm.service.ts", "api", "CRM client", "Creates leads and support tickets.");
  const mailClient = file("server/src/mail/mail.service.ts", "api", "Email client", "Sends email and push messages.");
  const mailCheck = file("server/src/mail/mailcheck.client.ts", "api", "Email checker client", "Checks an email address before sign-up.");
  const eventsClient = file("server/src/events/events-api.service.ts", "api", "Events client", "Reads event listings.");
  const leagueClient = file("server/src/leagues/leagues-api.service.ts", "api", "League client", "Reads league schedules.");
  const pushClient = file("server/src/push/push.service.ts", "api", "Push client", "Sends push notifications.");
  const cacheModule = file("server/src/cache/cache.module.ts", "api", "Cache module", "Connects to the cache.");
  const searchSvc = file("server/src/search/search.service.ts", "api", "Search", "Searches classes and schedules.");
  // The phone app: navigators, screens, hooks, services, components and tests.
  const mobileFiles: string[] = [];
  const rootNav = file("app/src/navigation/RootNavigator.tsx", "mobile", "Root navigator", "Shows the signed-out screens until sign-in, then the signed-in ones.");
  const homeNav = file("app/src/navigation/HomeTabsNavigator.tsx", "mobile", "Home tabs", "The tabs of the signed-in app.");
  const client = file("app/src/services/api/client.ts", "mobile", "Main server client", "Every request the app makes to the main server.", [["useSignIn", "function", 42, 1, "POST /member-signin/login"], ["useMemberDetail", "function", 77, 1, ""], ["useBookClass", "function", 120, 1, ""]]);
  const useBook = file("app/src/hooks/useBookButton.tsx", "mobile", "Book button", "The book button on a class page.");
  const useBookClass = file("app/src/hooks/useBookClass.ts", "mobile", "Book a class", "Checks products and privileges, then books.", [["useBookClass", "function", 15, 1, ""]]);
  for (let i = 0; i < 300; i++) mobileFiles.push(file(`app/src/components/group${i % 20}/Component${i}.tsx`, "mobile", `Component ${i}`, "A piece of a screen."));
  for (let i = 0; i < 80; i++) mobileFiles.push(file(`app/src/hooks/use${i}.ts`, "mobile", `Hook ${i}`, "Shared screen logic."));
  for (let i = 0; i < 230; i++) file(`app/__tests__/area${i % 10}/test${i}.test.tsx`, "mobile", `Test ${i}`, "A test of the app.");
  const screens: Record<string, unknown>[] = [];
  const screenFile = new Map<string, string>();
  const addScreen = (nm: string, group: string, gate: "signed_in" | "signed_out", navigator: string) => {
    const p = file(`app/src/screens/${gate === "signed_out" ? "auth" : group.split(" ")[0].toLowerCase()}/${nm}.tsx`, "mobile", nm.replace(/([a-z])([A-Z])/g, "$1 $2"), `The ${nm.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()} screen.`);
    screenFile.set(nm, p);
    screens.push({
      id: `screen:mobile:${nm}`, app: "mobile", fw: "react-navigation", file: p, url: `/(${navigator})/${nm}`, name: nm.replace(/([a-z])([A-Z])/g, "$1 $2"), description: `Registered as "${nm}" in ${navigator}.tsx.`,
      nav: { app: "mobile", navigator, group, gate, evidence: { file: navigator === "RootNavigator" ? rootNav : homeNav, line: 40 + screens.length, how: "code", confidence: 0.95 } },
      behind: [{ id: "f:" + p, kind: "screen", note: "The screen itself" }, { id: "f:" + client, kind: "part", note: "Requests to the main server" }],
    });
  };
  for (const nm of SIGNED_OUT) addScreen(nm, "Signing in", "signed_out", "RootNavigator");
  let k = 0;
  while (screens.length < 141) {
    for (const [group, names] of AREAS) {
      for (const nm of names) {
        const name = k ? `${nm}${k + 1}` : nm;
        if (screens.length < 141) addScreen(name, group, "signed_in", "HomeTabsNavigator");
      }
    }
    k++;
  }
  // A few website pages too, under their own app.
  for (const [url, nm] of [["/", "Home page"], ["/classes", "Classes"], ["/join", "Join online"]]) {
    screens.push({ id: `screen:web:${url}`, app: "web", fw: "next-app", file: webFiles[screens.length % 40], url, name: nm, description: `The ${nm.toLowerCase()} of the website.`, nav: { app: "web", navigator: "", group: "", gate: null }, behind: [{ id: "f:" + webFiles[screens.length % 40], kind: "screen", note: "The screen itself" }] });
  }

  // ---------- routes ----------
  type Route = { f: string; m: string; p: string; l: number; h: string; name: string; d: string };
  const routes: Route[] = [];
  const route = (f: string, m: string, p: string, l: number, name: string) => { routes.push({ f, m, p, l, h: "handler", name, d: name + "." }); return `r:${routes.length - 1}`; };
  const rSignIn = route(signinProxy, "POST", "/member-signin/login", 31, "Sign in (passed to the member system)");
  const rMembers = route(membersProxy, "POST", "/members/*", 44, "Member system pass-through");
  const rProfile = route(profileCtl, "GET", "/profile/me", 22, "The signed-in member's profile");
  const rSession = route(webSession, "POST", "/api/member-session", 30, "Start a member session");
  for (let i = 0; i < 100; i++) route(apiFiles[(i * 7) % apiFiles.length], ["GET", "POST", "PUT"][i % 3], `/api/area${i % 20}/item${i}`, 10 + i, `Endpoint ${i}`);

  // ---------- links ----------
  const links: Link[] = [];
  const ev = (file: string, line: number, how: "code" | "inferred" = "code"): Ev[] => [{ file, line, how, confidence: how === "code" ? 0.95 : 0.7 }];
  const link = (a: string, b: string, k: string, label: string, e: Ev[], extra: Partial<Link> = {}) => links.push({ a, b, k, w: 1, labels: [label], evidence: e, inferred: e[0].how === "inferred", ...extra });
  // Imports: most stay inside a part, some cross to the server, the tools or the content editor.
  const byPart = new Map<string, string[]>();
  for (const f of files) byPart.set(f.n, [...(byPart.get(f.n) ?? []), f.p]);
  const pick = (part: string, i: number) => { const xs = byPart.get(part)!; return xs[i % xs.length]; };
  for (let i = 0; i < 10_000; i++) {
    const f = files[(i * 7) % files.length];
    const to = i % 9 === 0 ? pick(["api", "tools", "studio"][i % 3], i) : pick(f.n, i * 13 + 1);
    if (to !== f.p) links.push({ a: `f:${f.p}`, b: `f:${to}`, k: "import", w: 1 });
  }
  // Web requests found in the code.
  for (let i = 0; i < 70; i++) {
    const from = pick(["web", "mobile", "display"][i % 3], i * 5);
    const ri = 4 + (i % 100);
    link(`f:${from}`, `f:${routes[ri].f}`, "http", `${routes[ri].m} ${routes[ri].p}`, ev(from, 20 + i), { calls: [[ri, 20 + i]] });
  }
  link(`f:${client}`, rSignIn, "http", "POST /member-signin/login", ev(client, 44));
  link(`f:${webSignIn}`, rSignIn, "http", "POST /member-signin/login", ev(webSignIn, 23));
  link(`f:${client}`, rMembers, "http", "POST /members/bookings/participate", ev(client, 122));
  link(`f:${client}`, rProfile, "http", "GET /profile/me", ev(client, 80));
  link(`f:${webSession}`, rMembers, "http", "POST /members/persons/detail", ev(webSession, 34));
  // Outside services: a literal address is found in the code; an env var or a name is inferred.
  link(`f:${signinProxy}`, "n:members-signin", "http", "proxy to SIGNIN_API_URL", ev(signinProxy, 19, "inferred"));
  link(`f:${membersClient}`, "n:members", "http", "base address MEMBERS_API", ev(membersClient, 15, "inferred"));
  link(`f:${mailCheck}`, "n:mailcheck", "http", "api.mailcheck.example", ev(mailCheck, 8));
  link(`f:${mailClient}`, "n:mail", "import", "the email service's package", ev(mailClient, 3));
  link(`f:${crmClient}`, "n:crm", "http", "CRM_* env", ev(crmClient, 12, "inferred"));
  link(`f:${eventsClient}`, "n:events", "http", "EVENTS_API_URL", ev(eventsClient, 9, "inferred"));
  link(`f:${leagueClient}`, "n:leagues", "http", "LEAGUES_API_URL", ev(leagueClient, 9, "inferred"));
  link(`f:${pushClient}`, "n:push", "import", "the push service's package", ev(pushClient, 2));
  link(`f:${pick("display", 3)}`, "n:members", "http", "PUBLIC_MEMBERS_API_HOST", ev(pick("display", 3), 5, "inferred"));
  // Data.
  link(`f:${ormConfig}`, "n:db", "data", "DATABASE_* env", ev(ormConfig, 6, "inferred"));
  link(`f:${cacheModule}`, "n:cache", "data", "CACHE_* env", ev(cacheModule, 10, "inferred"));
  link(`f:${searchSvc}`, "n:search", "data", "SEARCH_* env", ev(searchSvc, 14, "inferred"));
  link(`f:${schedulePipeline}`, "n:db", "data", "writes the schedule tables", ev(schedulePipeline, 51, "inferred"));
  link(`f:${schedulePipeline}`, "n:members", "data", "reads the member system's export", ev(schedulePipeline, 33, "inferred"));
  link(`f:${dataFiles[3]}`, "n:db", "data", "reads bookings", ev(dataFiles[3], 12, "inferred"));
  // The image resizer: the website's loader to the CDN (a literal in code), the CDN to the
  // function (infrastructure code), the function to its code (deployed by a workflow, by name).
  link(`f:${imageLoader}`, "n:cdn-images", "http", "default host images.example.com", ev(imageLoader, 14));
  link("n:cdn-images", "n:fn-resizer", "trigger", "origin is the function's address", ev(tfResizer, 41));
  link("n:fn-resizer", `f:${resizer}`, "trigger", "runs the resizer's handler", ev(tfResizer, 12));
  link(`f:${deployWorkflow}`, "n:fn-resizer", "deploy", "deploys by --function-name", ev(deployWorkflow, 27, "inferred"));
  link(`f:${tfResizer}`, "n:fn-resizer", "config", "the function is defined here", ev(tfResizer, 8));
  link(`f:${tfServer}`, "n:svc-api", "config", "the container service is defined here", ev(tfServer, 5));
  link("n:svc-api", `f:${membersProxy}`, "trigger", "routes /members/* to the server", ev(tfServer, 77, "inferred"));
  link("n:bucket", `f:${videoPreview}`, "trigger", "a new video starts a preview", ev(tfResizer, 90, "inferred"));
  // Screen to screen.
  link(`f:${screenFile.get("SignInLanding")}`, `f:${screenFile.get("SignIn")}`, "nav", "navigate('SignIn')", ev(screenFile.get("SignInLanding")!, 31));
  link(`f:${screenFile.get("SignIn")}`, `f:${screenFile.get("ForgotPassword")}`, "nav", "navigate('ForgotPassword')", ev(screenFile.get("SignIn")!, 64));

  // ---------- journeys ----------
  const st = (node: string, note: string, e: Ev[]) => ({ node, note, evidence: e });
  const flows = [
    { id: "mobile-sign-in", title: "Sign in on mobile", entry: "screen:mobile:SignInLanding", description: "A member opens the app, signs in, and lands on Home.", steps: [
      st("screen:mobile:SignInLanding", "The signed-out landing screen", ev(screenFile.get("SignInLanding")!, 12)),
      st("screen:mobile:SignIn", "The email and password form", ev(screenFile.get("SignIn")!, 48)),
      st(`f:${client}`, "useSignIn sends the email and password to the main server", ev(client, 44)),
      st(rSignIn, "The main server passes it through its allowed-paths proxy", ev(signinProxy, 31)),
      st("n:members-signin", "The member system checks the password and returns a token", ev(signinProxy, 19, "inferred")),
      st(rMembers, "The app reads the member through the pass-through", ev(membersProxy, 44)),
      st("n:members", "The member system returns the member", ev(membersClient, 15, "inferred")),
      st(rProfile, "The app reads its own profile", ev(profileCtl, 22)),
      st("n:db", "The profile row in the main database", ev(ormConfig, 6, "inferred")),
      st(`f:${rootNav}`, "The navigator swaps to the signed-in screens", ev(rootNav, 58)),
    ] },
    { id: "web-sign-in", title: "Sign in on the website", entry: `f:${webSignInForm}`, description: "Inside the join drawer: sign in, then a session cookie.", steps: [
      st(`f:${webSignInForm}`, "The join drawer's sign-in step", ev(webSignInForm, 20)),
      st(`f:${webDrawer}`, "handleSignIn", ev(webDrawer, 88)),
      st(`f:${webSignIn}`, "The browser sends the email and password", ev(webSignIn, 23)),
      st(rSignIn, "The main server's proxy", ev(signinProxy, 31)),
      st("n:members-signin", "The member system checks the password", ev(signinProxy, 19, "inferred")),
      st(rSession, "The website starts a member session", ev(webSession, 30)),
      st(rMembers, "It reads the member through the pass-through", ev(webSession, 34)),
      st("n:members", "The member system returns the member", ev(membersClient, 15, "inferred")),
    ] },
    { id: "mobile-book-class", title: "Book a class on mobile", entry: `f:${useBook}`, description: "From a class page to a confirmed booking.", steps: [
      st(`f:${useBook}`, "The book button on a class page", ev(useBook, 18)),
      st(`f:${useBookClass}`, "Checks products and privileges first", ev(useBookClass, 15)),
      st(`f:${client}`, "Sends the booking to the main server", ev(client, 122)),
      st(rMembers, "The pass-through checks the member owns it", ev(membersProxy, 44)),
      st(`f:${membersClient}`, "Calls the member system", ev(membersClient, 40)),
      st("n:members", "The booking is made in the member system", ev(membersClient, 15, "inferred")),
    ] },
    { id: "image-resize", title: "Show a resized image", entry: `f:${imageLoader}`, description: "How a website image reaches the resizer function.", steps: [
      st(`f:${imageLoader}`, "The image loader builds the image's address", ev(imageLoader, 14)),
      st("n:cdn-images", "The image CDN", ev(tfResizer, 41)),
      st("n:fn-resizer", "The resizer function's address", ev(tfResizer, 12)),
      st(`f:${resizer}`, "The resizer's code, deployed by its workflow", ev(deployWorkflow, 27, "inferred")),
      st(`f:${tfResizer}`, "Where the function and the CDN are defined", ev(tfResizer, 8)),
    ] },
    // Under the ship gate: kept, but never shown.
    { id: "draft-checkout", title: "Check out a draft", hidden: true, steps: [st(`f:${webDrawer}`, "draft", ev(webDrawer, 1)), st(rSession, "draft", ev(webSession, 1)), st("n:members", "draft", ev(membersClient, 1))] },
  ];

  // Counts on each node.
  const count = new Map<string, number>();
  for (const f of files) count.set(f.n, (count.get(f.n) ?? 0) + 1);
  for (const n of nodes) { const c = count.get(n.id) ?? 0; n.stats = { files: c, loc: c * 80, langs: c ? { typescript: c * 80 } : {}, repos: (n.stats as { repos: string[] }).repos }; }
  const heads = REPOS.map((r, i) => ({ path: r, name: r, branch: "main", head: (i + 1).toString(16).repeat(40).slice(0, 40), remote: null }));
  return {
    schema: "floorplan/graph@1",
    project: { name: "Riverside Clubs Digital Platform", summary: "Riverside Clubs' website, fitness app, main server, pipelines and cloud hosting." },
    meta: { agent: "none", audience: "everyone", counts: { files: files.length, loc: files.length * 80, unassigned: 0 }, generatedAt: "2026-11-23T12:00:00.000Z", exported: { at: "2026-11-23T12:00:00Z", by: "CoderHelm" }, repos: heads, rootName: "root" },
    nodes, files, routes, links, screens, flows,
    tour: [{ ref: "n:web", note: "What visitors see.", title: "Website" }],
    health: { summary: { high: 0, medium: 0, low: 0 }, issues: [] },
    coderhelm: { repos: Object.fromEntries(REPOS.map((r) => [r, `riverside-example/${r}`])), floorplan: "floorplan--v0.11.0" },
  };
}

/**
 * The same map as the platform hands it to the page: each System card and
 * top-level part that is one repository titled by that repository's name, its old name kept as
 * its role (common::app_map::name_by_repo), the way the page's copy holds it.
 */
export function v2MapNamed() {
  const m = v2Map();
  for (const n of m.nodes) {
    const paths = (n.paths as string[]).map((p) => p.replace(/\/+$/, ""));
    if ((n.level !== "system" && n.parent !== null) || n.kind === "external" || paths.length !== 1 || paths[0].includes("/")) continue;
    Object.assign(n, { role: n.label, label: paths[0], repos: [paths[0]] });
  }
  return m;
}
