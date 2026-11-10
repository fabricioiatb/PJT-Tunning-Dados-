// Estado na URL: "#aba?chave=valor&...". Abas, filtros e seleções ficam no
// endereço — dá para recarregar, compartilhar o link e usar voltar/avançar.
import { useCallback, useRef, useSyncExternalStore } from 'react';

export const ABA_PADRAO = 'operacao';

export function lerHash() {
  const [aba = '', query = ''] = window.location.hash.slice(1).split('?');
  return { aba: aba || ABA_PADRAO, params: new URLSearchParams(query) };
}

function inscrever(callback) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

export const useHash = () => useSyncExternalStore(inscrever, () => window.location.hash);

// Lê/escreve um parâmetro da aba atual. replace=true não cria entrada no
// histórico (bom para filtros digitados); false cria (seleções).
export function useParamUrl(chave, padrao = '') {
  useHash();
  const { aba: abaAtual, params: paramsAtuais } = lerHash();
  // Aba "dona" deste componente: uma tela sendo desmontada não pode
  // escrever parâmetros no endereço da aba seguinte.
  const abaDona = useRef(abaAtual);
  const valor = abaAtual === abaDona.current ? (paramsAtuais.get(chave) ?? padrao) : padrao;

  const definir = useCallback(
    (novo, { replace = true } = {}) => {
      const { aba, params } = lerHash();
      if (aba !== abaDona.current) return;
      if (novo === '' || novo == null) params.delete(chave);
      else params.set(chave, novo);
      const q = params.toString();
      const hash = `#${aba}${q ? `?${q}` : ''}`;
      if (hash === window.location.hash) return;
      if (replace) window.history.replaceState(null, '', hash);
      else window.history.pushState(null, '', hash);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    },
    [chave]
  );

  return [valor, definir];
}
