# MASTER PROJECT SPECIFICATION
## Customizable Personal Profile & Social Landing Page Platform

You are the lead software architect, senior full-stack engineer, UI/UX designer, DevOps engineer and security engineer responsible for designing and building this platform.

Your task is to develop a production-quality platform inspired by the general concept of guns.lol, but with its own identity, significantly expanded customization, additional interactive functionality and a long-term ecosystem.

This is not intended to be a simple link-in-bio clone. It should become a customizable personal identity platform where users can create visually impressive profiles, showcase their work, connect their accounts, interact with visitors and eventually extend their profiles through third-party widgets.

You must design the architecture so that the application can initially run on a personal laptop, move to a self-hosted desktop production server, and eventually migrate to cloud infrastructure without requiring a major rewrite.

---

# 1. PRODUCT VISION

Build a platform where every registered user can create a customizable public profile.

Example:

`https://platform.com/username`

Each profile should function as a combination of:

- Personal landing page.
- Social media link hub.
- Digital identity.
- Portfolio.
- Interactive profile.
- Customizable mini-website.

The platform should accommodate casual users who simply want a beautiful profile and advanced users who want extensive control over its appearance and functionality.

The experience should be easy for beginners without limiting experienced users.

## Core product philosophy

There should be two complementary customization experiences:

**Beginner experience**
- Select templates.
- Customize colors, fonts, backgrounds and layouts.
- Add components through a visual editor.
- Drag, drop, resize and reorder elements.
- Preview changes immediately.

**Advanced experience**
- Edit CSS directly.
- Customize component styling.
- Use advanced layout controls.
- Create custom themes.
- Eventually create custom widgets through a developer SDK.

Do not make advanced customization mandatory for ordinary users.

The platform should have a recognizable visual identity of its own. Do not directly copy guns.lol's branding, assets, source code or proprietary design.

---

# 2. DEVELOPMENT AND HOSTING STRATEGY

This is a mandatory architectural requirement.

The platform must support three environments using the same application codebase.

## Environment A: Personal laptop — development environment

My current development machine:

- Operating system: Linux Mint 22.2.
- Desktop environment: Cinnamon.
- Architecture: x86-64.
- CPU: Intel Core i5-4300U, 2 cores / 4 threads.
- RAM: 8 GB.
- Integrated Intel HD 4400 graphics.
- Development tools: VS Code / Cursor, Git, Node.js, Python and Docker-compatible tooling.

The laptop is primarily a development machine, not the intended permanent production server.

Requirements:

1. I must be able to clone the repository and start the entire development environment locally.
2. The development environment must not require paid cloud services.
3. Database, application and supporting services should run locally.
4. Use Docker Compose where practical.
5. Provide a simple startup command.
6. Support hot reload for frontend and backend development.
7. Support local media uploads.
8. Provide database migrations and seed data.
9. Allow testing authentication, profile creation, editing and publishing without an internet-facing deployment.
10. Avoid unnecessarily resource-intensive development services.

Expected workflow:

- Open the repository in VS Code or Cursor.
- Run the development startup command.
- Access the application through localhost.
- Make changes.
- Test them immediately.
- Commit changes to Git.
- Deploy the updated application to the desktop server when ready.

The development environment must be lightweight enough to run on an 8 GB laptop.

Avoid requiring Kubernetes, multiple heavyweight databases, unnecessary containers or microservices.

## Environment B: Old desktop — initial production environment

The first publicly accessible production deployment will run on an older desktop computer.

Current estimated hardware:

- RAM: 4 GB initially, upgradeable.
- Storage: approximately 500 GB, drive type to be confirmed.
- CPU: to be confirmed.
- Operating system: preferably a lightweight Linux server distribution.

The desktop will eventually operate as an always-on home server.

### Hardware-conscious architecture

The application must be able to operate under relatively limited hardware resources.

Requirements:

- Prefer a modular monolith.
- Use a single PostgreSQL instance.
- Use lightweight background processing.
- Do not introduce Redis unless a concrete requirement justifies it.
- Avoid unnecessary services.
- Configure sensible memory limits.
- Optimize image processing and caching.
- Avoid loading large amounts of data unnecessarily.
- Use database indexes and pagination.
- Keep logging under control.
- Ensure containers restart automatically after a reboot.

Target hardware upgrade:

- 8 GB RAM minimum.
- 16 GB RAM preferred.
- SSD strongly preferred for the operating system and database.

Do not assume the desktop has enterprise-grade hardware.

### Public accessibility

The website must be accessible publicly even though it is hosted from a residential internet connection.

My current internet connection:

- Download: 90.07 Mbps.
- Upload: 21.47 Mbps.
- Ping: 28 ms.
- Theoretical upload capacity: approximately 2.68 MB/s.

The upload connection is the relevant constraint because the server must deliver content to visitors.

Requirements:

1. Use Cloudflare Tunnel for public access.
2. Do not require router port forwarding.
3. Do not expose PostgreSQL directly to the internet.
4. Do not expose internal application management ports.
5. Keep SSH access restricted and secured.
6. Use HTTPS for public traffic.
7. Configure Cloudflare DNS appropriately.
8. Support a custom domain.
9. Include health checks and uptime monitoring.
10. Provide a clear procedure for restarting and updating the server.

Cloudflare Tunnel should connect the public hostname to the application running locally.

Example architecture:

Internet visitor
    |
    v
Cloudflare DNS / Edge
    |
    v
Cloudflare Tunnel
    |
    v
Home desktop server
    |
    v
Application
    |
    +---- PostgreSQL
    |
    +---- Local media storage
    |
    +---- Background worker

Cloudflare caching should be used where appropriate to reduce repeated requests to the home server.

Do not assume Cloudflare caching will automatically make all dynamic content cacheable. Configure cache behavior deliberately.

### Self-hosting limitations

Design around these constraints:

- Residential upload bandwidth.
- Potential power outages.
- Potential ISP interruptions.
- Storage failure.
- Hardware failure.
- Limited RAM.
- Traffic spikes.
- Potential abuse and denial-of-service attempts.

Implement:

- Database backups.
- Media backups.
- Health checks.
- Structured logs.
- Error reporting.
- Graceful failure handling.
- Restart policies.
- Resource monitoring.
- Rate limiting.

Backups must be stored somewhere other than the server's primary drive. A second partition on the same disk is not a reliable backup.

The application should remain usable during ordinary periods of low traffic, but do not promise unlimited simultaneous visitors from residential hardware.

## Environment C: Cloud hosting — future production environment

Eventually, the platform should move from the home server to professional cloud infrastructure.

This must be possible without rewriting the application.

Potential infrastructure:

- Application hosting: VPS, dedicated server or container platform.
- Database: managed PostgreSQL or dedicated PostgreSQL instance.
- Media: Cloudflare R2 or another S3-compatible storage provider.
- CDN: Cloudflare.
- DNS: Cloudflare.
- Background processing: separate worker when necessary.
- Monitoring: external uptime and error monitoring.

Do not hardcode infrastructure-specific assumptions into the application.

The same Docker image and application code should work in development, self-hosted production and cloud production.

### Migration requirements

Design a documented migration process that supports:

1. Deploying the application to a new cloud server.
2. Installing or provisioning PostgreSQL.
3. Exporting the current database using pg_dump.
4. Restoring the database in the new environment.
5. Migrating uploaded media.
6. Reconfiguring environment variables.
7. Configuring DNS and Cloudflare.
8. Verifying authentication and sessions.
9. Verifying profile URLs.
10. Verifying payment and subscription state.
11. Switching traffic to the cloud deployment.
12. Keeping the old server available temporarily for rollback.

The migration must preserve:

- User accounts.
- Profiles.
- Usernames.
- Published profile versions.
- Drafts.
- Uploaded media.
- Integrations.
- Analytics.
- Subscriptions.
- Payment records.
- Custom domains.
- Widget configurations.

Provide a practical migration and rollback guide.

---

# 3. RECOMMENDED TECHNOLOGY STACK

Use a modern, maintainable and portable stack.

Suggested technologies:

### Frontend
- Next.js.
- React.
- TypeScript.
- Tailwind CSS.
- Framer Motion.
- Responsive component architecture.

### Backend
- Next.js server-side functionality or a clearly separated API layer where justified.
- TypeScript.
- Modular monolith architecture.
- REST API where appropriate.
- Webhooks for external services.

### Database
- PostgreSQL.
- Prisma ORM.
- Proper migrations.
- Database indexes.
- Transaction handling.

### Authentication
- Auth.js or another suitable authentication solution.
- Email/password authentication.
- OAuth support.
- Email verification.
- Password recovery.
- Secure sessions.

### Editor
- React-based visual editor.
- Monaco Editor for advanced CSS editing.
- Component hierarchy and property panels.
- Live preview.

### Infrastructure
- Docker.
- Docker Compose.
- Cloudflare.
- Cloudflare Tunnel.
- Cloudflare R2 or local storage abstraction.
- Caddy only if a reverse proxy is genuinely required.
- Resend or an equivalent email provider.

### Testing
- Vitest.
- Playwright.
- TypeScript checks.
- ESLint.
- Integration tests.

Do not blindly install every suggested dependency. Select the smallest reasonable set of tools that satisfies the requirements.

---

# 4. APPLICATION ARCHITECTURE

Use a modular monolith.

Do not create microservices prematurely.

Organize the application into clearly separated modules:

1. Authentication.
2. User accounts.
3. Public profiles.
4. Profile editor.
5. Profile renderer.
6. Themes.
7. Components and widgets.
8. Media management.
9. External integrations.
10. Analytics.
11. Subscriptions and billing.
12. Administration.
13. Notifications.
14. Developer platform.

Each module should have defined responsibilities and avoid unnecessary coupling.

The public profile renderer should be optimized independently from the dashboard and editor.

---

# 5. USER ACCOUNTS AND AUTHENTICATION

Users should be able to:

- Register.
- Log in.
- Log out.
- Verify their email.
- Reset their password.
- Change account details.
- Change their username.
- Manage connected accounts.
- Manage sessions.
- Delete their account.

Support future OAuth providers.

### Username system

Every profile has a unique username.

Example:

`platform.com/ArliT1`

Requirements:

- Unique usernames.
- Case-insensitive username comparison.
- Reserved usernames.
- Username validation.
- Protection against impersonation.
- Username-change cooldown or safeguards.
- Proper handling of deleted usernames.
- Prevent route collisions with application routes.

---

# 6. PUBLIC PROFILE SYSTEM

Each user receives a public profile.

Example:

`platform.com/username`

Profiles should support:

### Identity
- Profile picture.
- Display name.
- Username.
- Biography.
- Location, optionally.
- Custom status.
- Verification indicator where applicable.

### Appearance
- Custom backgrounds.
- Background images.
- Background videos where supported.
- Custom fonts.
- Custom color schemes.
- Gradients.
- Borders.
- Shadows.
- Rounded corners.
- Custom spacing.
- Animated elements.
- Custom cursor effects where appropriate.

### Content
- Social links.
- Website links.
- Project showcases.
- Image galleries.
- Video embeds.
- Text sections.
- Downloadable files.
- Contact buttons.
- Custom buttons.
- Music players.
- Interactive widgets.

### Profile behavior
- Public/private visibility.
- Draft and published states.
- Custom page title.
- SEO metadata.
- Open Graph metadata.
- Responsive layout.
- Mobile-friendly rendering.

The public profile must load quickly and work on mobile, tablet and desktop.

---

# 7. VISUAL PROFILE EDITOR

The editor is one of the most important parts of the product.

It should feel like a real visual design tool, not a collection of basic settings forms.

### Editor layout

Use a three-panel interface:

**Left panel: Layers and components**
- Component hierarchy.
- Add component.
- Remove component.
- Duplicate component.
- Reorder components.
- Group components where appropriate.

**Center panel: Live canvas**
- Real-time preview.
- Selectable components.
- Drag and drop.
- Resizing.
- Alignment guides.
- Device previews.

**Right panel: Properties**
- Dimensions.
- Colors.
- Typography.
- Spacing.
- Borders.
- Shadows.
- Animations.
- Component-specific settings.

### Essential functionality

- Live preview.
- Autosave.
- Undo and redo.
- Copy and paste components.
- Duplicate components.
- Drag and drop.
- Responsive previews.
- Desktop/mobile editing.
- Component visibility.
- Draft and publish controls.
- Revision history.
- Restore previous versions.

Changes must not accidentally publish before the user chooses to publish.

### Advanced customization

Include a dedicated advanced mode.

Use Monaco Editor for custom CSS.

Support:

- Custom CSS.
- CSS variables.
- Responsive CSS.
- Component-specific selectors.
- Syntax highlighting.
- Error detection.
- Live preview.
- Reset controls.

Custom CSS must be scoped to the user's profile.

Do not allow arbitrary CSS to compromise the platform's own interface.

Do not execute arbitrary user JavaScript on the primary application origin.

If custom JavaScript is introduced in a future version, isolate it using an appropriately sandboxed iframe and separate origin, with strict permissions.

---

# 8. THEMES AND TEMPLATES

Provide a collection of professionally designed templates.

Possible categories:

- Minimal.
- Dark.
- Light.
- Gaming.
- Developer.
- Creative.
- Portfolio.
- Cyberpunk.
- Glassmorphism.
- Editorial.
- Anime-inspired.
- Music-oriented.
- Professional.

Templates should be starting points, not restrictive layouts.

Users must be able to customize templates extensively.

Support saving custom themes.

Eventually allow community-created themes.

---

# 9. WIDGET SYSTEM

Build a modular widget architecture.

Each widget should have:

- Unique identifier.
- Display name.
- Description.
- Category.
- Version.
- Default configuration.
- Configuration schema.
- Rendering component.
- Permission requirements.
- Documentation.

Initial widgets:

### Social
- Social links.
- Custom buttons.
- Contact button.
- Guestbook.

### Media
- Music player.
- Spotify integration.
- Image gallery.
- Video embed.

### Gaming
- Discord presence.
- Steam profile.
- Steam recently played games.
- League of Legends statistics as a future integration.
- Minecraft server status.

### Development
- GitHub profile.
- GitHub repositories.
- Contribution information.
- Project showcase.

### General
- Countdown.
- Status indicator.
- Rich text.
- Visitor counter.
- Custom information cards.

Widgets must be independently configurable and reusable.

Do not build all integrations at once. Create the underlying architecture first, then implement widgets incrementally.

---

# 10. EXTERNAL INTEGRATIONS

Support integrations with external services.

Potential services:

- Discord.
- Spotify.
- Steam.
- GitHub.
- Twitch.
- YouTube.

Use official APIs and OAuth where available.

Requirements:

- Secure token storage.
- Token encryption.
- Token refresh.
- Token revocation.
- Permission management.
- API rate-limit handling.
- Graceful failure when external APIs are unavailable.

Never expose private API credentials or OAuth secrets to frontend code.

Do not scrape services when an official API is available and suitable.

---

# 11. ANALYTICS

Provide a profile analytics dashboard.

Track:

- Profile views.
- Unique visitors.
- Link clicks.
- Widget interactions.
- Popular links.
- Referrers.
- Traffic over time.
- Country-level traffic where appropriate.

Use privacy-conscious analytics.

Avoid collecting unnecessary personally identifiable information.

Provide a retention policy and allow users to understand what is being collected.

Analytics must not become a performance bottleneck.

---

# 12. MEDIA STORAGE

The platform must support:

- Avatars.
- Background images.
- Background videos.
- Gallery images.
- Audio files where permitted.
- Project images.

This system must support two storage providers.

### Local storage

For development and initial self-hosting:

- Store media on the desktop server's filesystem.
- Keep files outside the application source directory.
- Organize media into predictable directories.
- Prevent directory traversal.
- Validate MIME types and actual file signatures.
- Enforce file-size limits.
- Generate optimized image variants.
- Avoid loading original high-resolution files unnecessarily.

Example structure:

`/srv/platform/media/`

- avatars/
- backgrounds/
- galleries/
- audio/
- uploads/

### S3-compatible storage

For cloud hosting:

- Support Cloudflare R2 or another S3-compatible provider.
- Use signed uploads where appropriate.
- Keep storage credentials server-side.
- Support media migration.

### Storage abstraction

Create a storage interface such as:

`StorageProvider`

Implement:

- LocalStorageProvider.
- S3StorageProvider.

The application should not need to know which provider is active.

Select the provider through environment configuration.

Do not hardcode local filesystem paths or R2 URLs throughout the application.

---

# 13. DATABASE DESIGN

Use PostgreSQL.

Design a normalized and extensible schema.

Potential entities:

- User.
- Account.
- Session.
- Profile.
- ProfileDraft.
- ProfileVersion.
- ProfileComponent.
- Theme.
- Widget.
- WidgetConfiguration.
- MediaAsset.
- SocialLink.
- Integration.
- AnalyticsEvent.
- Subscription.
- Payment.
- Coupon.
- CustomDomain.
- Report.
- AuditLog.
- Notification.

Use appropriate foreign keys, indexes and constraints.

Use database transactions for operations that must succeed or fail together.

Provide migrations and seed scripts.

Avoid storing entire application state in a single unstructured JSON column.

JSON configuration is acceptable for genuinely flexible component-specific settings, but core business data should remain structured.

---

# 14. PAYMENTS AND SUBSCRIPTIONS

The platform should eventually support a freemium business model.

Do not make payment processing a prerequisite for the initial local development version.

Design the billing architecture early enough that premium features can be introduced without restructuring the application.

Potential payment methods:

- Credit and debit cards.
- PayPal, subject to supported merchant and payout arrangements.
- Cryptocurrency through a suitable payment provider.
- Other supported regional payment methods.

The platform may eventually use a Merchant of Record provider for international sales.

Do not assume every payment provider supports businesses registered in Albania. Verify merchant eligibility, payouts, fees, KYC requirements and local compliance before choosing one.

### Suggested subscription structure

**Free**
- Basic profile.
- Standard templates.
- Limited customization.
- Basic links.
- Basic analytics.

**Pro**
- Advanced customization.
- More themes.
- Advanced widgets.
- More media storage.
- Advanced analytics.
- Custom CSS.

**Premium**
- Custom domains.
- More advanced profile capabilities.
- Additional storage.
- Premium templates.
- Additional integrations.
- Advanced customization.

Treat these as initial product hypotheses, not final pricing decisions.

### Billing architecture

Create:

- Payment provider abstraction.
- Subscription service.
- Entitlement service.
- Payment history.
- Webhook handling.
- Billing dashboard.

Never trust a checkout redirect as proof of payment.

Verify signed webhooks.

Use idempotent payment processing.

Store transaction records.

Premium access must be controlled through a centralized entitlement system rather than scattered subscription checks.

---

# 15. SECURITY

Security is a core requirement.

Implement:

- Secure password hashing.
- Session security.
- CSRF protection where applicable.
- XSS protection.
- SQL injection protection.
- SSRF protection.
- Rate limiting.
- Input validation.
- Output encoding.
- Secure file uploads.
- Authorization checks.
- Secure environment variables.
- Audit logging.
- Abuse reporting.
- Account deletion.
- API authentication.
- Webhook signature verification.

Pay special attention to user-generated content.

Users must not be able to use profile customization to execute arbitrary code on the main platform domain.

Never commit secrets to Git.

Provide an `.env.example` without real credentials.

---

# 16. ADMINISTRATION

Create a protected administration dashboard.

Administrators should be able to:

- View users.
- View profiles.
- Manage reported content.
- Review abuse reports.
- Suspend accounts.
- Manage usernames.
- Manage themes.
- Manage widgets.
- View platform statistics.
- Manage subscriptions.
- Review audit logs.
- Configure platform-wide settings.

Use role-based access control.

Administrative actions must be logged.

The administration dashboard must not be publicly accessible without authorization.

---

# 17. UI/UX AND DESIGN DIRECTION

The platform must look polished and modern.

Avoid generic dashboard designs and default component-library appearances.

The public website, profile editor and user profiles should share a consistent design language.

Design goals:

- Modern.
- Clean.
- Visually distinctive.
- Smooth animations.
- High-quality typography.
- Strong spacing and hierarchy.
- Responsive.
- Dark and light themes.
- Excellent mobile experience.

The profile editor should feel powerful but approachable.

The public profile should be the visual centerpiece of the product.

Do not sacrifice usability for visual effects.

Respect reduced-motion preferences and provide accessible controls.

---

# 18. SEO AND PERFORMANCE

Public profiles must be discoverable by search engines when users choose public visibility.

Implement:

- Server-rendered public profiles where appropriate.
- Metadata.
- Open Graph images.
- Canonical URLs.
- Sitemap support.
- Robots directives.
- Optimized image delivery.
- Lazy loading.
- Responsive images.
- Efficient database queries.
- Caching.
- Pagination.
- Code splitting.

Do not cache private or personalized information publicly.

Use cache invalidation when profiles are updated.

Ensure profile URLs remain stable.

---

# 19. DOCKER AND DEPLOYMENT REQUIREMENTS

The project must be Docker-ready from the beginning.

Provide:

- Dockerfile.
- Docker Compose configuration.
- Development configuration.
- Self-hosted production configuration.
- Cloud production configuration.
- PostgreSQL service configuration.
- Persistent volumes.
- Health checks.
- Restart policies.
- Database migration commands.
- Backup scripts.
- Restore scripts.

Use separate environment files for each deployment environment.

Example:

- `.env.development`
- `.env.selfhosted`
- `.env.cloud`
- `.env.example`

Never commit actual secrets.

The Docker Compose configuration should support a lightweight setup.

Example services:

1. web application.
2. PostgreSQL.
3. background worker, if required.
4. Cloudflare Tunnel for the self-hosted deployment.

Redis should remain optional until a specific requirement makes it necessary.

Ensure the application can run without the tunnel in local development.

Do not expose database ports publicly.

---

# 20. BACKUPS AND DISASTER RECOVERY

Implement automated backups.

Database:

- Regular PostgreSQL backups.
- Timestamped backup files.
- Backup rotation.
- Restore procedure.
- Backup verification.

Media:

- Backup uploaded files.
- Preserve directory structure or storage identifiers.
- Ensure database references remain consistent.

At least one backup copy must exist outside the production machine.

Document how to restore the entire platform after:

- Database corruption.
- Accidental deletion.
- Drive failure.
- Operating system failure.
- Migration failure.

A backup that has never been tested is not sufficient.

---

# 21. DEVELOPMENT ROADMAP

Develop the project incrementally.

Do not attempt to implement every feature simultaneously.

## V1 — Functional foundation

Deliver a usable platform.

Features:

- Authentication.
- User accounts.
- Username system.
- Public profiles.
- Basic profile editor.
- Social links.
- Profile image.
- Background image.
- Basic themes.
- Draft and publish.
- Responsive public profiles.
- Basic dashboard.
- Local media storage.
- PostgreSQL.
- Docker Compose.
- Local development support.
- Self-hosted deployment support.

V1 must be usable without any payment provider or external integration.

## V2 — Advanced customization

Features:

- Visual drag-and-drop editor.
- Component hierarchy.
- Advanced properties panel.
- Monaco CSS editor.
- Responsive controls.
- Animations.
- More templates.
- Undo and redo.
- Revision history.
- Custom fonts.
- Advanced backgrounds.

## V3 — Interactive profiles

Features:

- Widget system.
- Music player.
- Discord integration.
- Spotify integration.
- Steam integration.
- GitHub integration.
- Galleries.
- Guestbooks.
- Profile analytics.
- Additional profile components.

## V4 — Commercial platform

Features:

- Subscription system.
- Payment provider integration.
- Premium entitlements.
- Billing dashboard.
- Custom domains.
- Administrative dashboard.
- More advanced analytics.
- Premium themes.
- Storage quotas.

## V5 — Ecosystem

Features:

- Third-party widget SDK.
- Developer API.
- Theme marketplace.
- Widget marketplace.
- Advanced integrations.
- Creator tools.
- Advanced analytics.
- Internationalization.
- More scalable background processing.
- Cloud scaling and observability.

V5 is a long-term goal. Do not build its infrastructure prematurely.

---

# 22. REQUIRED DOCUMENTATION

Maintain documentation throughout development.

Create:

- README.md.
- ARCHITECTURE.md.
- DATABASE.md.
- DEVELOPMENT.md.
- SELF_HOSTING.md.
- CLOUD_DEPLOYMENT.md.
- MIGRATION.md.
- BACKUP_AND_RESTORE.md.
- SECURITY.md.
- API.md.
- ROADMAP.md.

Documentation must reflect the actual implementation.

Do not write documentation for features that do not exist.

---

# 23. DEVELOPMENT WORKFLOW

Before implementing anything:

1. Inspect the existing repository.
2. Identify existing code and dependencies.
3. Determine whether a project already exists.
4. Avoid overwriting working functionality.
5. Create an architecture plan.
6. Identify potential risks.
7. Define the database schema.
8. Define the deployment structure.
9. Present the implementation plan.

Then implement V1.

After each major implementation stage:

- Run TypeScript checks.
- Run linting.
- Run tests.
- Run database migrations.
- Test authentication.
- Test profile creation.
- Test profile editing.
- Test publishing.
- Test public profile rendering.
- Test responsive layouts.
- Test Docker startup.
- Test backup and restoration where applicable.

Fix errors before continuing.

Do not use fake functionality, placeholder API responses presented as real integrations, nonfunctional buttons or hardcoded demonstration data in production features.

If an external integration cannot be implemented without credentials, create the proper integration structure and document the required configuration.

---

# 24. DEFINITION OF DONE FOR V1

V1 is not complete until all of the following work:

1. A user can register.
2. A user can log in.
3. A user can choose a unique username.
4. A user can create a public profile.
5. A user can upload an avatar.
6. A user can upload a background.
7. A user can add, edit, reorder and delete links.
8. A user can customize basic profile styling.
9. A user can preview their profile.
10. A user can save a draft.
11. A user can publish their profile.
12. Visitors can access the public profile URL.
13. The profile works on mobile and desktop.
14. User data is stored persistently.
15. Uploaded media is stored persistently.
16. The application can restart without losing data.
17. The project runs locally on the development laptop.
18. The project can be deployed to the self-hosted desktop.
19. The public self-hosted deployment works through Cloudflare Tunnel.
20. The project can eventually be deployed to cloud infrastructure without changing its core application architecture.

---

# 25. FINAL ARCHITECTURAL PRINCIPLES

These requirements are non-negotiable:

- Build for portability from day one.
- Use the same application code across all three environments.
- Keep development local and inexpensive.
- Make the desktop server a legitimate production deployment, not a separate experimental codebase.
- Make cloud migration a deployment and infrastructure change, not a rewrite.
- Use PostgreSQL consistently.
- Abstract media storage.
- Avoid premature microservices.
- Avoid unnecessary dependencies.
- Prioritize security.
- Prioritize performance.
- Keep the code maintainable.
- Document operational procedures.
- Do not sacrifice architecture quality for rapid feature delivery.

## Expected outcome

Deliver a real, maintainable and expandable product.

The first objective is a functional V1 that I can develop on my Linux Mint laptop, deploy to my own desktop server and make publicly accessible through my domain.

The second objective is to expand it into a serious profile customization platform.

The final objective is to have a cloud-portable product capable of supporting a growing user base, subscriptions, integrations, analytics and a third-party widget ecosystem.

Start by inspecting the repository and presenting the proposed architecture and implementation plan. Do not begin by generating a large amount of code without first understanding the project structure.
