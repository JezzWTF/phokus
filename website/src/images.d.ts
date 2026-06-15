// Typing for vite-imagetools `?as=picture` imports. The query ends in `as=picture`,
// so this wildcard matches each screenshot import. Shape mirrors imagetools' Picture.
declare module "*as=picture" {
  const picture: {
    sources: Record<string, string>;
    img: { src: string; w: number; h: number };
  };
  export default picture;
}
