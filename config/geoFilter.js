/**
 * Geo-based profile filtering configuration.
 * Uses Cloudflare's cf-ipcountry header to detect visitor country,
 * with MOCK_COUNTRY env variable as fallback for local testing.
 */

// Major Pakistani cities used for matching profiles
const pakistaniCities = [
  "Karachi",
  "Lahore",
  "Islamabad",
  "Rawalpindi",
  "Faisalabad",
  "Multan",
  "Peshawar",
  "Quetta",
  "Sialkot",
  "Gujranwala",
  "Hyderabad",
  "Abbottabad",
  "Bahawalpur",
  "Sargodha",
  "Sukkur",
  "Larkana",
  "Mardan",
  "Gujrat",
  "Sahiwal",
  "Mirpur",
  "Sheikhupura", "Jhang", "Rahim Yar Khan", "Kasur", "Muzaffargarh",
  "Nawabshah", "Chiniot", "Kamoke", "Hafizabad", "Sadiqabad",
  "Burewala", "Jacobabad", "Shikarpur", "Kohat", "Jhelum",
  "Hafizabad", "Khanewal", "Gojra", "Mandi Bahauddin", "Daska",
  "Dera Ghazi Khan", "Dera Ismail Khan", "Mingora", "Bannu", "Khuzdar"
];

// Country filter configuration keyed by ISO country code
const countryFilterConfig = {
  PK: {
    countryName: "Pakistan",
    cities: pakistaniCities,
    // Countries to show in the filter dropdown
    filterCountries: [
      { value: "Pakistan", label: "Pakistan" },
    ],
    // Cities to show in the filter dropdown
    filterCities: {
      Pakistan: pakistaniCities.concat(["Other"]),
    },
  },
  // Add more countries here as needed
};

/**
 * Detect visitor's country code from request.
 * Priority: Cloudflare header > MOCK_COUNTRY env variable > null
 * Googlebot and other crawlers bypass geo-filtering entirely.
 */
function detectCountry(req) {
  const ua = req.headers["user-agent"] || "";
  // Bypass geo-filter for crawlers so Googlebot can access all profiles
  if (/googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|facebot|ia_archiver/i.test(ua)) {
    return null;
  }
  return req.headers["cf-ipcountry"] || process.env.MOCK_COUNTRY || null;
}

/**
 * Build a MongoDB location filter based on detected country.
 * Returns an object to merge into the query filter, or empty object if no geo-filter applies.
 */
function buildGeoFilter(countryCode) {
  if (!countryCode) return {};

  const config = countryFilterConfig[countryCode.toUpperCase()];
  if (!config) return {};

  // Match profiles where country is the detected country (case-insensitive)
  // OR city matches one of the major cities (case-insensitive)
  const cityRegexes = config.cities.map((c) => new RegExp(`^${c}$`, "i"));

  return {
    $or: [
      { country: { $regex: new RegExp(`^${config.countryName}$`, "i") } },
      { city: { $in: cityRegexes } },
    ],
  };
}

/**
 * Get filter UI config for the detected country.
 * Returns { countries, cities, detectedCountry } for the EJS templates.
 * If no geo-restriction, returns the full default lists.
 */
function getFilterUIConfig(countryCode) {
  if (!countryCode) return null;

  const config = countryFilterConfig[countryCode.toUpperCase()];
  if (!config) return null;

  return {
    detectedCountryCode: countryCode.toUpperCase(),
    countries: config.filterCountries,
    cities: config.filterCities,
  };
}

module.exports = {
  detectCountry,
  buildGeoFilter,
  getFilterUIConfig,
  pakistaniCities,
  countryFilterConfig,
};
