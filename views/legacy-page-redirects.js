// 301 redirects for retired landing pages.
//
// These pages were removed under the UK-only, Islamic marriage guidance strategy:
// non-UK city/country pages, pages already published on damourmuslim.com, and the
// pages named in that site's footer. Each one now points at the closest surviving
// page so no indexed URL returns a 404.

const LEGACY_REDIRECTS = {
  // Replacement pages named in the content plan
  "/muslim-marriage": "/istikhara-for-marriage",
  "/halal-marriage": "/is-nikah-legal-in-uk",
  "/muslim-matrimonial": "/mahr-in-the-uk",
  "/find-muslim-spouse": "/wali-for-nikah-uk",
  "/muslim-singles-uk": "/nikah-ceremony-uk-step-by-step",
  "/divorced-muslim-marriage": "/khula-in-the-uk",

  // Pages already live on damourmuslim.com and duplicated in its footer
  "/muslim-matchmaking": "/wali-for-nikah-uk",
  "/muslim-rishta": "/wali-for-nikah-uk",
  "/muslim-marriage-uk": "/nikah-ceremony-uk-step-by-step",
  "/british-pakistani-marriage": "/nikah-ceremony-uk-step-by-step",
  "/muslim-second-marriage": "/khula-in-the-uk",
  "/muslim-marriage-over-30": "/istikhara-for-marriage",

  // Duplicated trust / website-comparison pages point at live core pages
  "/verified-muslim-profiles": "/profiles",
  "/trusted-muslim-matchmaking": "/wali-for-nikah-uk",
  "/best-muslim-marriage-website": "/",
  "/free-muslim-marriage-site": "/pricing",

  // Non-UK city and country pages
  "/online-rishta-pakistan": "/wali-for-nikah-uk",
  "/rishta-lahore": "/wali-for-nikah-uk",
  "/rishta-karachi": "/wali-for-nikah-uk",
  "/rishta-islamabad": "/wali-for-nikah-uk",
  "/rishta-rawalpindi": "/wali-for-nikah-uk",
  "/rishta-faisalabad": "/wali-for-nikah-uk"
};

module.exports = function (app) {
  Object.keys(LEGACY_REDIRECTS).forEach(function (from) {
    app.get(from, (req, res) => {
      res.redirect(301, LEGACY_REDIRECTS[from]);
    });
  });
};

module.exports.redirects = LEGACY_REDIRECTS;
