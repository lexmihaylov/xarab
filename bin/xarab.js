#!/usr/bin/env node

import { tsImport } from "tsx/esm/api";

await tsImport("../src/cli.jsx", import.meta.url);
