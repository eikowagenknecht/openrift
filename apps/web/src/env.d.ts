declare const __COMMIT_HASH__: string;

declare module "*.md?raw" {
  const content: string;
  export default content;
}
