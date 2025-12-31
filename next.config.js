/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/imersoes/:id/tarefas",
        destination: "/imersoes/:id?tab=tarefas",
      },
    ];
  },
};

module.exports = nextConfig;
