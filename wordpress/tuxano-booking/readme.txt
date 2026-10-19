=== Tuxano Booking ===
Contributors: tuxano
Tags: transportation, reservation, booking, chauffeur
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 2.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Executive transportation requests with route-based pricing and private administration.

== Description ==
Five-step reservation form, Google Places search and exact map pickup selection,
ordered stops/waits, configurable fleet/collections, transfer/hourly fares,
extras and gratuity, private submissions, customer/admin emails and retention.
No payment gateway is included. Requests require manual availability review.

== Installation ==
1. Upload tuxano-booking-2.0.0.zip in Plugins > Add New > Upload Plugin; activate.
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
Custom email template design remains a separate later enhancement.

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
= 2.0.0 =
WordPress conversion with configurable fleet/pricing, server-authoritative
route quotes, validated/idempotent submissions, administration and notifications.
