export const Button = ({ children, onClick, style, variant, ...props }) => {
  const baseStyle = { 
    padding: '8px 16px', 
    borderRadius: '4px', 
    cursor: 'pointer',
    border: 'none',
    backgroundColor: variant === 'primary' ? '#4caf50' : '#e0e0e0',
    color: variant === 'primary' ? '#fff' : '#000',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontWeight: 'bold'
  };
  return (
    <button onClick={onClick} style={{ ...baseStyle, ...style }} {...props}>
      {children}
    </button>
  );
};
