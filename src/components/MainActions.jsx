import React from 'react';

export default function MainActions({ actions }) {
  return (
    <div>
      {actions.map((action, index) => (
        <button
          key={index}
          onClick={action.onClick}
          aria-label={action.label}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}