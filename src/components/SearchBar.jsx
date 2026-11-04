import React from 'react';

export default function SearchBar({ term, onTermChange }) {
  return (
    <div>
      <input
        type="text"
        value={term}
        onChange={(e) => onTermChange(e.target.value)}
        placeholder="Buscar no marketplace..."
        aria-label="Campo de busca"
      />
    </div>
  );
}