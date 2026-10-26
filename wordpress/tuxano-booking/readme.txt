=== Tuxano Booking ===
Contributors: farhan
Tags: transportation, reservation, booking, chauffeur
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 2.3.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Executive transportation requests with route-based pricing and private administration.

== Description ==
Five-step reservation form, Google Places search and exact map pickup selection,
ordered stops/waits, configurable fleet/collections, transfer/hourly fares,
extras and gratuity, private submissions, customer/admin emails and retention.
No payment gateway is included. Requests require manual availability review.

== Installation ==
1. Upload tuxano-booking-2.3.0.zip in Plugins > Add New > Upload Plugin; activate.
2. Open Tuxano Booking > Settings. Configure the browser Maps/Places key and
   the separate private Google Routes key, notification recipients and business details.
3. Review every seeded vehicle tariff in Vehicles and global fees in Pricing.
4. Configure Terms/Privacy page URLs and your WordPress timezone.
5. Add [tuxano_booking] to a page. The same-origin iframe isolates the design
   from theme styles. The standalone form also uses ?tuxano_booking_form=1.
   For the complete reference layout, select the page template
   "Tuxano Booking — full page". That page renders the form without theme chrome.
6. Test a request and both email recipients. Configure your preferred WordPress
   SMTP/mail transport if needed; wp_mail acceptance does not establish delivery.
7. Set an appropriate daily Google request budget and visitor/network limits
   in Settings. Exclude the dedicated form document and REST endpoints from
   caching; they provide private no-store headers. Activate separately per site;
   network-wide multisite activation is intentionally unsupported.

Seeded tariffs are starter examples from the prototype. Replace them with your
approved business rates before accepting real requests. Changing currency does
not convert numeric tariffs. Stored submissions retain their original prices.
Customer receipts, administrator notifications and optional booking-update emails
include the brand, journey and itemized estimate. An estimate is not a payment receipt.

== Administrator workflow ==
Submissions include search, date/status filters, 10/20/50/100 rows per page,
View/Edit actions and explicitly confirmed selected-row deletion. Edit contact,
itinerary, vehicle, passengers, extras and status with an audit history and
protection against overwriting another administrator's changes. Contact-only
corrections retain the accepted price; changed routes/options or an explicit
recalculation use server-validated route metrics and tariffs. Select the customer
notification checkbox to send the committed update and current itemized estimate.
API cards distinguish saved configuration from an actual connection test. The
browser test checks Maps/Places in an isolated browser frame; the Routes test
uses one server request. Blank inputs preserve saved keys; removal requires Save.
Each vehicle tariff component can be explicitly None/not charged. Existing
tariffs and stored requests are retained on upgrade.

== Frontend ==
A plain background, compact responsive layout and 1200px maximum content width
keep the form suitable for desktop and laptop pages. Step navigation scrolls
to the top, including same-origin shortcode embeds. Contact fields show inline
validation. All 249 ISO countries are available; state/province is always a text
input, and region/postal code are optional for international addresses.
Pickup, stops and drop-off support map selection. Selecting a map address or POI
uses its exact Google place; an arbitrary pin still requires confirmation.
Country-aware suggestions and known-country checks help prevent accidental
cross-country selections. Unknown coordinate countries are not guessed; the
server still requires an actual driving route and calculates authoritative fares.

== Availability and status emails ==
The same vehicle at the same exact pickup minute can have only one confirmed
booking. Pending/new/reviewing requests show an acknowledgement warning and may
still be submitted. Another vehicle at that minute remains available. Cancelled
and completed requests release their slot. Availability is rechecked before
continuing from vehicle selection and again when saving/confirming on the server.
Times use the WordPress website timezone; saved historical timezones are retained.
Lifecycle emails are automatic when customer notifications are enabled. Ordinary
booking edits can still use the optional detailed-update email checkbox.
Settings > Email supports a Media Library image or public image URL for the logo;
an empty value uses the bundled wordmark. The email header background is #0a121f.

== External services and privacy ==
Google Maps JavaScript/Places receive typed location searches and chosen points.
Google Routes receives the ordered route from the WordPress server. The Routes
key is never sent to the visitor. Google usage requires enabled APIs, billing
and suitable key restrictions. Maps browser keys are public by design.
Google terms: https://cloud.google.com/maps-platform/terms
Google privacy: https://policies.google.com/privacy
Optional device location is checked for accuracy and requires confirmation;
PC network positions may be inaccurate. Users can choose an exact map point.
Contact/billing/passenger/itinerary details are stored privately and sent to
configured mail recipients. Site operators must complete their privacy policy,
review lawful retention and secure their hosting/backups/mail provider.
WordPress privacy export/erase hooks and optional retention are provided.
Live traffic is excluded; pickup time uses the WordPress site timezone.

== Data lifecycle ==
Deactivation retains settings and bookings. Deleting the plugin retains them
by default. To explicitly remove plugin data on uninstall, define
TUXANO_BOOKING_REMOVE_DATA as true in wp-config.php first. Media attachments
remain in the WordPress media library. Back up needed records before erasure.

== Changelog ==

= 2.3.0 =
* Add thank-you-style customer/admin emails with configurable email logo and dark navy header.
* Automatically send concise confirmed, cancelled and completed customer notifications.
* Check per-vehicle pickup-time availability with pending-request warnings and confirmed booking blocks.
* Enforce confirmed-slot conflicts in final submission and administrator updates, including simultaneous confirmations.
* Preserve legacy booking data while adding indexed vehicle and UTC pickup slots.

= 2.2.1 =
* Open quick-booking date/time pickers on field clicks, touch taps and keyboard activation.
* Keep native editors visible when programmatic pickers are unavailable.

= 2.2.0 =
* Add an inline quick-booking shortcode and configurable destination page.
* Restore quick trip intent with fresh route validation before vehicle selection.
* Improve map confirmation under camera rounding and correct toggle indicators.

= 2.1.3 =
* Improve deliberate map-point confirmation on touch devices.
* Align mobile billing fields and review details with their section icons.

= 2.1.2 =
* Add validated form heading/progress color settings for custom page backgrounds.
* Preview map search areas while typing without confirming a location; start unselected maps in the United States.
* Refine search result geometry and thank-you embedding/footer spacing.
* Expand and refine the premium booking administration layout.


= 2.1.1 =
* Transparent form/embed backgrounds and WordPress/Elementor background support in the full-page template.
* Restore the original responsive thank-you hero/design.
* Refine all booking admin screens including native fleet/collections, improve readable typography, remove decorative workspace branding.
* Dashboard recent submissions defaults to three with a private bounded setting.
* Map search previews its actual location on the live map for deliberate pin selection and confirmation.

= 2.1.0 =
Premium admin interface, complete audited booking edits and update emails,
explicit bulk management, simpler optional tariffs, API connection checks,
branded notifications, international contact validation and improved map/form UX.
Author: Farhan. Author website: https://farhanrajnajmul.com/

= 2.0.1 =
Add tested PHP 7.4 compatibility without changing booking validation or prices.

= 2.0.0 =
WordPress conversion with configurable fleet/pricing, server-authoritative
route quotes, validated/idempotent submissions, administration and notifications.
