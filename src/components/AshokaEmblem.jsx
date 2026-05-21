export default function AshokaEmblem({ size = 44, className = '', style = {} }) {
  return (
    <img 
      src="/emblem-of-india.svg" 
      alt="National Emblem of India" 
      style={{ 
        width: size, 
        height: 'auto', 
        maxHeight: size,
        objectFit: 'contain',
        display: 'block',
        ...style
      }}
      className={className}
    />
  );
}
