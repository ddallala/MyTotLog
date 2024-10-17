const fs = require('fs');
const packageJson = require('./package.json');

const version = packageJson.version;

const now = new Date();
const pstOptions = {
  timeZone: "America/Los_Angeles",
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
};

const pstDateString = now.toLocaleString('en-US', pstOptions);

// Extracting the components directly from the formatted string
const [datePart, timePart] = pstDateString.split(', ');
const [month, day, year] = datePart.split('/');
const [hours, minutes, seconds] = timePart.split(':');

// Building the version string
const buildVersion = `${version}-${year}${month}${day}-${hours}${minutes}`;
const buildVersionContent = `export const BUILD_VERSION = '${buildVersion}';\n`;

fs.writeFileSync('src/environments/build-version.ts', buildVersionContent, { encoding: 'utf8' });
console.log(`Build version set to ${buildVersion}`);