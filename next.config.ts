import type { NextConfig } from "next";

const repositoryName = "Samsungdang-DojoLog-Member";
const isPagesBuild = process.env.GITHUB_PAGES === "true";
const basePath = isPagesBuild ? `/${repositoryName}` : "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_REPOSITORY_NAME: repositoryName,
  },
};

export default nextConfig;
