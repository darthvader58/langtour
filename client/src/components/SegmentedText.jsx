export default function SegmentedText({ text = '', activeRanges = [], inline = false, onWordClick, style }) {
  const isCharActive = (index) => {
    return activeRanges.some(r => index >= r.start && index < r.end);
  };

  const content = text.split('').map((char, index) => {
    const active = isCharActive(index);
    return (
      <span
        key={index}
        onClick={(e) => {
          if (onWordClick) {
            e.stopPropagation();
            onWordClick(index, char);
          }
        }}
        style={{
          fontWeight: active ? 'bold' : 'normal',
          backgroundColor: active ? 'rgba(255, 193, 7, 0.4)' : 'transparent',
          cursor: onWordClick ? 'pointer' : 'default',
        }}
      >
        {char}
      </span>
    );
  });

  if (inline) {
    return <span style={style}>{content}</span>;
  }
  return <div style={style}>{content}</div>;
}
