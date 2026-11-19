import { defineConfig } from 'eslint/config';
import expo from 'eslint-config-expo/flat.js';
export default defineConfig([expo, { ignores: ['dist/**', 'src/data/**', 'src/design/bridge.js'] }]);
