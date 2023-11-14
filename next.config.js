const { i18n } = require('./next-i18next.config');

/** @type {import('next').NextConfig} */
const nextConfig = {
  i18n,
  reactStrictMode: true,

  env: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_API_HOST: process.env.OPENAI_API_HOST,
    OPENAI_API_TYPE: process.env.OPENAI_API_TYPE,
    OPENAI_API_VERSION: process.env.OPENAI_API_VERSION,
    OPENAI_DEPLOYMENT_ID: process.env.OPENAI_DEPLOYMENT_ID,
    OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL,
  },

  webpack(config, { isServer, dev }) {
    config.experiments = {
      asyncWebAssembly: true,
      layers: true,
    };

    return config;
  },
};

module.exports = nextConfig;
