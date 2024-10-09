// Taken from here https://github.com/ZKON-Network/zkapp/blob/devnet/build-mina-fungible-token.js

import * as fs from 'fs';

const configFile = './node_modules/.pnpm/zkonmina@https+++codeload.github.com+ZKON-Network+zkapp+tar.gz+28749c97de82dd3a426497621ff416_77jz7h6ro5dnm672mpbn7h7sda/node_modules/mina-fungible-token/tsconfig.json';
const content = JSON.parse(fs.readFileSync(configFile));
delete content.compilerOptions.typeRoots;
fs.writeFileSync(configFile, JSON.stringify(content, null, 4));
