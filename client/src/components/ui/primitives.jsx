export const Button = ({ children, onClick, style, ...props }) => (
  <button onClick={onClick} style={{ padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', ...style }} {...props}>
    {children}
  </button>
);
