// Lets TypeScript accept `import html from "./interface.html"`.
// Place in src/. esbuild inlines the file as a string (see build.ts .html loader).
declare module "*.html" {
  const content: string;
  export default content;
}
