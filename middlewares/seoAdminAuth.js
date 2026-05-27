// SEO Admin Authentication Middleware
// Separate authentication for SEO administrators

const requireSeoAdmin = (req, res, next) => {
  if (req.session.isSeoAdmin) {
    return next();
  }
  return res.redirect("/seoadmin/login");
};

const requireSeoAdminApi = (req, res, next) => {
  if (req.session.isSeoAdmin) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized - SEO Admin access required" });
};

module.exports = {
  requireSeoAdmin,
  requireSeoAdminApi,
};
