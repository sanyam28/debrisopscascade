/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  output: 'export',
  allowedDevOrigins: ['10.61.40.231'],
  // cacheComponents: true,
  // partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
