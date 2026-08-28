const opt = (flags, description, required = false) => ({ flags, description, required });
const confirm = opt("--confirm", "Confirm this mutation.");
const dryRun = opt("--dry-run", "Preview without applying the mutation.");
const publicationUrl = opt("--publication-url <url>", "Substack publication URL.", true);
const optionalPublicationUrl = opt("--publication-url <url>", "Substack publication URL.");
const draftId = opt("--draft-id <id>", "Draft identifier.", true);
const postId = opt("--post-id <id>", "Post identifier.", true);
const publicationId = opt("--publication-id <id>", "Publication identifier.", true);
const fromPublicationId = opt("--from-publication-id <id>", "Recommending publication identifier.", true);
const limit = opt("--limit <number>", "Maximum results.");
const offset = opt("--offset <number>", "Results to skip.");
export const commandFamilies = [
    { name: "auth", description: "Manage Substack authentication.", operations: [
            { name: "status", description: "Use this command to inspect authentication status." },
            { name: "import", description: "Use this command to import authenticated browser state.", options: [opt("--base64 <value>", "Base64-encoded Playwright storage state.", true), confirm] },
            { name: "export", description: "Use this command to export authenticated browser state." },
            { name: "capture", description: "Use this command to capture authenticated browser state.", options: [{ flags: "--cdp <url>", description: "Chromium CDP endpoint.", defaultValue: "http://127.0.0.1:9222" }, confirm] },
            { name: "host", description: "Use this command to manage the hosted authentication flow.", options: [opt("--session-url <url>", "Nori Session URL."), opt("--stop", "Stop the hosted authentication flow."), confirm] },
        ] },
    { name: "profile", description: "Inspect Substack profiles.", operations: [
            { name: "me", description: "Use this command to read the authenticated profile." },
            { name: "get", description: "Use this command to read a public profile.", options: [opt("--user-id <id>", "Numeric user identifier.", true), opt("--handle <handle>", "Substack handle.", true)] },
        ] },
    { name: "publication", description: "Inspect and manage publications.", operations: [
            { name: "get", description: "Use this command to get a public Substack publication.", options: [opt("--url <url>", "Substack publication URL.", true)] },
            { name: "feed", description: "Use this command to read a publication RSS feed.", options: [opt("--url <url>", "Substack publication URL.", true)] },
            { name: "archive", description: "Use this command to read a public publication archive.", options: [publicationUrl] },
            { name: "owned", description: "Use this command to list editable publications." },
            { name: "search", description: "Use this command to search publications.", options: [opt("--query <query>", "Search query.", true), opt("--page <number>", "Zero-indexed page.")] },
            { name: "settings", description: "Use this command to read publication settings.", options: [publicationUrl] },
            { name: "update", description: "Use this command to update publication metadata.", options: [publicationUrl, opt("--data <json>", "JSON object containing fields to update.", true), dryRun, confirm] },
            { name: "sections", description: "Use this command to list sections.", options: [publicationUrl] },
            { name: "pages", description: "Use this command to list pages.", options: [publicationUrl] },
            { name: "users", description: "Use this command to list publication users.", options: [publicationUrl] },
            { name: "tags", description: "Use this command to list publication tags.", options: [publicationUrl] },
            { name: "export", description: "Use this command to inspect the latest publication export.", options: [publicationUrl] },
        ] },
    { name: "post", description: "Inspect and manage posts.", operations: [
            { name: "list", description: "Use this command to list public Substack posts.", options: [publicationUrl, limit, offset] },
            { name: "get", description: "Use this command to get a public post by id.", options: [publicationUrl, postId] },
            { name: "export", description: "Export a public Substack post as a portable article bundle.", options: [opt("--url <url>", "Public Substack post URL.", true), opt("--output <path>", "Destination JSON file.", true)] },
            { name: "drafts", description: "Use this command to list publication drafts.", options: [publicationUrl, limit, offset] },
            { name: "create", description: "Use this command to create a draft.", options: [publicationUrl, opt("--data <json>", "Draft JSON payload.", true), dryRun, confirm] },
            { name: "update", description: "Use this command to update a draft.", options: [publicationUrl, draftId, opt("--data <json>", "Draft JSON payload.", true), dryRun, confirm] },
            { name: "delete", description: "Use this command to delete a draft.", options: [publicationUrl, draftId, confirm] },
            { name: "publish", description: "Use this command to publish a Substack draft.", options: [publicationUrl, draftId, opt("--send-email", "Email subscribers."), dryRun, confirm] },
            { name: "schedule", description: "Use this command to schedule a draft.", options: [publicationUrl, draftId, opt("--at <iso>", "ISO publication time.", true), opt("--audience <audience>", "Post audience."), dryRun, confirm] },
            { name: "stats", description: "Use this command to read post analytics.", options: [publicationUrl, postId, limit, offset] },
        ] },
    { name: "note", description: "Inspect and manage Notes.", operations: [
            { name: "feed", description: "Use this command to read the Notes feed.", options: [limit, opt("--cursor <cursor>", "Pagination cursor.")] },
            { name: "profile", description: "Use this command to read a profile feed.", options: [opt("--user-id <id>", "Numeric user identifier.", true), limit] },
            { name: "export", description: "Export public Substack Notes as normalized JSON.", options: [opt("--user-id <id>", "Numeric user identifier.", true), { flags: "--lookback-hours <hours>", description: "Only include recent Notes.", defaultValue: "4" }, opt("--note-id <id>", "Export a specific Note regardless of the lookback window."), opt("--output <path>", "Destination JSON file.", true)] },
            { name: "get", description: "Use this command to read a feed entity.", options: [opt("--entity-key <key>", "Feed entity key.", true)] },
            { name: "drafts", description: "Use this command to list Note drafts.", options: [publicationUrl, limit] },
            { name: "create", description: "Use this command to create a Note.", options: [opt("--text <text>", "Exact Note text.", true), opt("--reply-minimum-role <role>", "Minimum reply role."), dryRun, confirm] },
            { name: "reply", description: "Use this command to reply to a Note.", options: [opt("--comment-id <id>", "Parent comment identifier.", true), opt("--text <text>", "Exact reply text.", true), dryRun, confirm] },
            { name: "delete", description: "Use this command to delete a Note.", options: [opt("--comment-id <id>", "Comment identifier.", true), confirm] },
            { name: "mark-seen", description: "Use this command to mark a feed entity seen.", options: [opt("--entity-key <key>", "Feed entity key.", true), confirm] },
        ] },
    { name: "comment", description: "Inspect and manage comments.", operations: [
            { name: "list", description: "Use this command to list post comments.", options: [publicationUrl, postId, limit] },
            { name: "create", description: "Use this command to comment on a post.", options: [publicationUrl, postId, opt("--text <text>", "Exact comment text.", true), confirm] },
            { name: "delete", description: "Use this command to delete a comment.", options: [opt("--comment-id <id>", "Comment identifier.", true), confirm] },
            { name: "react", description: "Use this command to react to a post.", options: [publicationUrl, postId, opt("--reaction <emoji>", "Reaction emoji."), confirm] },
            { name: "unreact", description: "Use this command to remove a post reaction.", options: [publicationUrl, postId, confirm] },
            { name: "moderation", description: "Use this command to list moderation reasons." },
        ] },
    { name: "reader", description: "Inspect the Substack reader.", operations: [
            { name: "inbox", description: "Use this command to read the inbox.", options: [limit] },
            { name: "feed", description: "Use this command to read the reader feed.", options: [limit, opt("--cursor <cursor>", "Pagination cursor.")] },
            { name: "tabs", description: "Use this command to list reader feed tabs." },
            { name: "subscriptions", description: "Use this command to list reader subscriptions.", options: [limit, offset] },
            { name: "archive", description: "Use this command to read a publication archive.", options: [publicationUrl] },
            { name: "activity", description: "Use this command to read the activity counter." },
            { name: "messages", description: "Use this command to read direct messages." },
            { name: "unread-counts", description: "Use this command to read message and chat counters." },
            { name: "blocked-users", description: "Use this command to list blocked user identifiers." },
        ] },
    { name: "subscriber", description: "Manage subscribers.", operations: [
            { name: "list", description: "Use this command to list subscribers.", options: [publicationUrl, limit, offset] },
            { name: "add", description: "Use this command to add a subscriber.", options: [publicationUrl, opt("--email <email>", "Subscriber email.", true), opt("--name <name>", "Subscriber name."), confirm] },
            { name: "remove", description: "Use this command to remove a subscriber.", options: [publicationUrl, opt("--subscription-id <id>", "Subscription identifier.", true), confirm] },
            { name: "import-status", description: "Use this command to read subscriber import status.", options: [publicationUrl] },
        ] },
    { name: "recommendation", description: "Manage recommendations.", operations: [
            { name: "list", description: "Use this command to list recommendations.", options: [publicationUrl, publicationId, limit, offset] },
            { name: "search", description: "Use this command to search publications for recommendations.", options: [opt("--query <query>", "Search query.", true), opt("--page <number>", "Zero-indexed page.")] },
            { name: "suggested", description: "Use this command to list suggested recommendations.", options: [publicationUrl, publicationId] },
            { name: "add", description: "Use this command to add a recommendation.", options: [publicationUrl, fromPublicationId, publicationId, opt("--source <source>", "Recommendation source."), opt("--suggested", "Mark as a suggested recommendation."), confirm] },
            { name: "remove", description: "Use this command to remove a recommendation.", options: [publicationUrl, fromPublicationId, publicationId, opt("--source <source>", "Recommendation source."), confirm] },
            { name: "relationship", description: "Use this command to inspect a recommendation edge.", options: [publicationUrl, fromPublicationId, publicationId] },
            { name: "stats", description: "Use this command to read incoming recommendation statistics.", options: [publicationUrl, limit, offset] },
        ] },
    { name: "analytics", description: "Inspect publication analytics.", operations: [
            { name: "summary", description: "Use this command to read dashboard analytics.", options: [publicationUrl, opt("--range <days>", "Number of days.")] },
            { name: "post", description: "Use this command to read post analytics.", options: [publicationUrl, postId, limit, offset] },
            { name: "email", description: "Use this command to read email-send timeseries.", options: [publicationUrl] },
            { name: "growth", description: "Use this command to read growth sources.", options: [publicationUrl, opt("--from <date>", "Start date, YYYY-MM-DD.", true), opt("--to <date>", "End date, YYYY-MM-DD.", true)] },
            { name: "network", description: "Use this command to read network attribution.", options: [publicationUrl] },
            { name: "pledges", description: "Use this command to read payment pledges.", options: [publicationUrl] },
            { name: "timeseries", description: "Use this command to read dashboard timeseries.", options: [publicationUrl, opt("--range <days>", "Number of days.")] },
        ] },
    { name: "chat", description: "Inspect and manage Substack chat.", operations: [
            { name: "settings", description: "Use this command to update chat settings.", options: [optionalPublicationUrl, publicationId, opt("--data <json>", "Settings JSON.", true), dryRun, confirm] },
            { name: "list", description: "Use this command to list chat posts.", options: [optionalPublicationUrl, publicationId] },
            { name: "scheduled", description: "Use this command to list scheduled chat posts.", options: [optionalPublicationUrl, publicationId] },
            { name: "send", description: "Use this command to send a chat post.", options: [optionalPublicationUrl, publicationId, opt("--data <json>", "Chat post JSON.", true), dryRun, confirm] },
            { name: "delete", description: "Use this command to delete a chat post.", options: [optionalPublicationUrl, opt("--thread-id <id>", "Chat thread identifier.", true), confirm] },
        ] },
    { name: "media", description: "Upload and inspect media.", operations: [
            { name: "image-upload", description: "Use this command to upload an image.", options: [publicationUrl, opt("--file <path>", "Image file path.", true), opt("--content-type <type>", "Image MIME type."), dryRun, confirm] },
            { name: "audio-upload", description: "Use this command to upload and start transcoding audio.", options: [publicationUrl, opt("--file <path>", "Audio file path.", true), dryRun, confirm] },
            { name: "audio-status", description: "Use this command to inspect audio transcode status.", options: [publicationUrl, opt("--upload-id <id>", "Audio upload identifier.", true)] },
        ] },
    { name: "discover", description: "Discover public Substack content without authentication.", operations: [
            { name: "categories", description: "Use this command to list public Substack categories." },
            { name: "search", description: "Use this command to search public Substack content.", options: [opt("--query <query>", "Search query.", true)] },
        ] },
    { name: "live", description: "Inspect live streams.", operations: [
            { name: "streams", description: "Use this command to list live streams.", options: [publicationUrl] },
            { name: "eligible-hosts", description: "Use this command to list eligible live hosts.", options: [publicationUrl] },
        ] },
    { name: "crosspost", description: "Inspect cross-posting integrations.", operations: [
            { name: "linkedin", description: "Use this command to read LinkedIn authorization status.", options: [publicationUrl] },
            { name: "youtube", description: "Use this command to read YouTube authorization status.", options: [publicationUrl] },
        ] },
];
//# sourceMappingURL=specs.js.map