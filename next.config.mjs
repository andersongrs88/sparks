/** @type {import('next').NextConfig} */
const nextConfig = {
  // typedRoutes is useful once the route map is stable.
  // While we are still building modules (e.g., Serviços/Produtos/etc.),
  // it causes strict type errors in <Link href="...">.
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
