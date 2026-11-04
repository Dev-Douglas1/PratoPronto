import React from 'react';

export default function StoreFeedSection({ stores }) {
  return (
    <div>
      <h2>Lojas Disponíveis</h2>
      <ul>
        {stores.map((store, index) => (
          <li key={index}>
            <a href={store.link} aria-label={`Visitar loja ${store.name}`}>
              {store.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}