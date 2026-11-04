/**
 * A faithful, isolated snapshot of the existing Birmingham page.
 * The source HTML, CSS, JavaScript, and images live together under public/pages.
 */
export function Current() {
  return (
    <iframe
      title="Current Birmingham, Alabama page"
      src="/__mockup/pages/birmingham-current/index.html"
      style={{
        display: "block",
        width: "100%",
        height: "3600px",
        border: 0,
      }}
    />
  );
}
