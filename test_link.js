import { renderMarkdown } from './src/ui/markdown.js';

const link = renderMarkdown("[Test website](https://test.com)");
console.log(link);
