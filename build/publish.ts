/* eslint-disable no-await-in-loop */
/* eslint-disable import/no-dynamic-require */
import { writeFileSync } from 'fs';
import path from 'path';
import ora from 'ora';
import packageJson from 'package-json';
import { gt, prerelease } from 'semver';
import { getWorkspaces, spawnAsync } from './utils';

const {
    CI, GITHUB_EVENT_NAME, GITHUB_REF,
} = process.env;

const tag = GITHUB_REF === 'refs/heads/master' ? 'latest' : GITHUB_REF === 'refs/heads/next' ? 'dev' : undefined;

if (CI && (!tag || GITHUB_EVENT_NAME !== 'push')) {
    console.log('publish skipped.');
    process.exit(0);
}

(async () => {
    let folders = await getWorkspaces();
    if (process.argv[2]) {
        folders = folders.filter((p) => p.startsWith(process.argv[2]));
    }

    const spinner = ora();
    const bumpMap = {};

    let progress = 0;
    spinner.start(`Loading workspaces (0/${folders.length})`);
    await Promise.all(folders.map(async (name) => {
        let meta;
        try {
            meta = require(`../${name}/package.json`);
            if (tag === 'dev') {
                try {
                    const result = await packageJson(meta.name, { version: meta.version });
                    if (result?.version === meta.version) return progress++; // no change on dev version
                } catch (e) {
                    // expected
                }
            } else if (prerelease(meta.version)) return progress++; // Refuse to publish prerelease as 'latest' tag
            if (!meta.private && /^[0-9.]+$/.test(meta.version)) {
                try {
                    const { version } = await packageJson(meta.name, { version: tag });
                    if (typeof version === 'string' && gt(meta.version, version)) bumpMap[name] = meta.version;
                } catch (e) {
                    if (e.name === 'VersionNotFoundError') bumpMap[name] = meta.version;
                    else throw e;
                }
            } else {
                // x.x.x-alpha.x
                bumpMap[name] = meta.version;
            }
        } catch (e) {
            console.error(e);
        }
        spinner.text = `Loading workspaces (${++progress}/${folders.length})`;
        return progress;
    }));
    spinner.succeed();

    if (Object.keys(bumpMap).length) {
        for (const name in bumpMap) {
            console.log(`publishing ${name}@${bumpMap[name]} ...`);
            if (tag === 'dev') {
                const location = require.resolve(`../${name}/package.json`);
                const pkg = require(location);
                if (!prerelease(pkg.version)) {
                    pkg.version += '-dev';
                    writeFileSync(location, JSON.stringify(pkg));
                }
            }
            await spawnAsync(
                `yarn npm publish --access public --tag ${tag}`,
                path.resolve(name),
            );
        }
    }
    console.log('Release created successfully.');
})();
