#!/usr/bin/env node

import { tsImport } from "tsx/esm/api";

await tsImport("../src/cli-opentui.jsx", import.meta.url);
