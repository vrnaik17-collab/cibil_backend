const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location to your project directory on Render
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
