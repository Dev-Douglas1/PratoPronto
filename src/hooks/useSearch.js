import { useState, useEffect } from 'react';
import { searchMarketplace } from '../services/marketplace.js';

export function useSearch() {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState({ companies: [], products: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (term.trim().length < 2) {
      setResults({ companies: [], products: [] });
      setError('');
      setLoading(false);
      return;
    }

    let live = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');

      try {
        const value = await searchMarketplace(term);
        if (live) {
          setResults({
            companies: value?.companies || [],
            products: value?.products || [],
          });
        }
      } catch {
        if (live) {
          setResults({ companies: [], products: [] });
          setError('Não foi possível pesquisar empresas agora.');
        }
      } finally {
        if (live) setLoading(false);
      }
    }, 250);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [term]);

  return { term, setTerm, results, loading, error };
}