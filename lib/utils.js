export function searchAndReplace(str, find, replace) {
  return str.split(find).join(replace);
}
export function escapeHTML(text) {
  let comment;
  comment = searchAndReplace(text, '<', '&lt;');
  comment = searchAndReplace(comment, '>', '&gt;');
  return comment;
}