import { useEffect, useState } from 'react';
import { api, brl, dia, TIPOS, NOME_TIPO } from '../api';
import {
  Alerta,
  Badge,
  BotaoEnviar,
  CabecalhoPagina,
  Campo,
  Card,
  Carregando,
  InputPlaca,
  Placa,
  SelectGaragem,
  TipoVeiculo,
  Vazio,
  useAcao,
  useAvisoSaida,
  useCarregar,
  useConfirmar,
} from '../ui';
import { useParamUrl } from '../url';

const fmtCpf = (c) => (c?.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c);

// Link dentro da aba Clientes preservando a busca atual.
const linkCliente = (id, q, extra = {}) =>
  `#clientes?${new URLSearchParams({ ...(q && { q }), ...(id && { id: String(id) }), ...extra })}`;

const VAZIO_CLIENTE = { nome: '', cpf: '', email: '', telefone: '', placa: '', modelo: '', tipo: 'CARRO' };

function NovoCliente({ onCriado, onCancelar }) {
  const [f, setF] = useState(VAZIO_CLIENTE);
  const { ocupado, erro, executar } = useAcao();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  useAvisoSaida(Object.keys(f).some((k) => f[k] !== VAZIO_CLIENTE[k]));

  const enviar = async (e) => {
    e.preventDefault();
    const body = { nome: f.nome, cpf: f.cpf, email: f.email || undefined, telefone: f.telefone || undefined };
    if (f.placa) body.veiculos = [{ placa: f.placa, modelo: f.modelo || undefined, tipo: f.tipo }];
    const r = await executar(() => api.criarCliente(body));
    if (r) onCriado(r.id);
  };

  return (
    <Card titulo="Novo cliente" id="novo-cliente">
      <form onSubmit={enviar}>
        <Campo label="Nome completo">
          <input
            name="nome"
            value={f.nome}
            onChange={set('nome')}
            autoComplete="off"
            placeholder="ex.: Maria Souza…"
            required
          />
        </Campo>
        <div className="linha">
          <Campo label="CPF" dica="Só números ou com pontuação.">
            <input
              name="cpf"
              value={f.cpf}
              onChange={set('cpf')}
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              placeholder="ex.: 123.456.789-00…"
              translate="no"
              required
            />
          </Campo>
          <Campo label="Telefone">
            <input
              name="telefone"
              type="tel"
              inputMode="tel"
              value={f.telefone}
              onChange={set('telefone')}
              autoComplete="off"
              placeholder="ex.: (11) 99999-0000…"
            />
          </Campo>
        </div>
        <Campo label="E-mail">
          <input
            name="email"
            type="email"
            value={f.email}
            onChange={set('email')}
            autoComplete="off"
            spellCheck={false}
            placeholder="ex.: maria@email.com…"
          />
        </Campo>

        <fieldset className="form-tipo">
          <legend className="campo-label">Veículo (opcional)</legend>
          <div className="linha">
            <Campo label="Placa">
              <InputPlaca valor={f.placa} onChange={(v) => setF({ ...f, placa: v })} required={false} />
            </Campo>
            <Campo label="Modelo">
              <input
                name="modelo"
                value={f.modelo}
                onChange={set('modelo')}
                autoComplete="off"
                placeholder="ex.: Onix…"
              />
            </Campo>
            <Campo label="Tipo">
              <select name="tipo" value={f.tipo} onChange={set('tipo')}>
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {NOME_TIPO[t]}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        </fieldset>
        <p className="nota" style={{ marginBottom: 14 }}>
          Cliente e veículo são gravados na mesma transação no PostgreSQL: se a placa for inválida ou repetida, o
          cliente também não é criado.
        </p>
        <Alerta focar>{erro}</Alerta>
        <div className="linha">
          <button type="button" className="btn" onClick={onCancelar}>
            Cancelar
          </button>
          <BotaoEnviar ocupado={ocupado} textoOcupado="Salvando cliente…">
            Salvar cliente
          </BotaoEnviar>
        </div>
      </form>
    </Card>
  );
}

// Edição dos dados do cliente (PUT /clientes/:id).
function EditarCliente({ c, onSalvo, onCancelar }) {
  const inicial = { nome: c.nome, cpf: fmtCpf(c.cpf), email: c.email || '', telefone: c.telefone || '' };
  const [f, setF] = useState(inicial);
  const { ocupado, erro, executar } = useAcao();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  useAvisoSaida(Object.keys(f).some((k) => f[k] !== inicial[k]));

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await executar(() =>
          api.atualizarCliente(c.id, {
            nome: f.nome,
            cpf: f.cpf,
            email: f.email || null,
            telefone: f.telefone || null,
          }),
        );
        if (r) onSalvo();
      }}
    >
      <Campo label="Nome completo">
        <input name="nome" value={f.nome} onChange={set('nome')} autoComplete="off" required />
      </Campo>
      <div className="linha">
        <Campo label="CPF">
          <input
            name="cpf"
            value={f.cpf}
            onChange={set('cpf')}
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            translate="no"
            required
          />
        </Campo>
        <Campo label="Telefone">
          <input
            name="telefone"
            type="tel"
            value={f.telefone}
            onChange={set('telefone')}
            autoComplete="off"
            placeholder="ex.: (11) 99999-0000…"
          />
        </Campo>
      </div>
      <Campo label="E-mail">
        <input
          name="email"
          type="email"
          value={f.email}
          onChange={set('email')}
          autoComplete="off"
          spellCheck={false}
          placeholder="ex.: maria@email.com…"
        />
      </Campo>
      <Alerta focar>{erro}</Alerta>
      <div className="linha">
        <button type="button" className="btn" onClick={onCancelar}>
          Cancelar
        </button>
        <BotaoEnviar ocupado={ocupado} textoOcupado="Salvando alterações…">
          Salvar alterações
        </BotaoEnviar>
      </div>
    </form>
  );
}

// Edição de um veículo em linha (PUT /veiculos/:id).
function EditarVeiculo({ v, onSalvo, onCancelar }) {
  const [f, setF] = useState({ placa: v.placa, modelo: v.modelo || '', cor: v.cor || '', tipo: v.tipo });
  const { ocupado, erro, executar } = useAcao();
  return (
    <form
      className="edicao-inline"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await executar(() =>
          api.atualizarVeiculo(v.id, { placa: f.placa, modelo: f.modelo || null, cor: f.cor || null, tipo: f.tipo }),
        );
        if (r) onSalvo();
      }}
    >
      <div className="linha">
        <Campo label="Placa">
          <InputPlaca valor={f.placa} onChange={(p) => setF({ ...f, placa: p })} />
        </Campo>
        <Campo label="Modelo">
          <input
            name="modelo"
            value={f.modelo}
            onChange={(e) => setF({ ...f, modelo: e.target.value })}
            autoComplete="off"
          />
        </Campo>
        <Campo label="Cor">
          <input name="cor" value={f.cor} onChange={(e) => setF({ ...f, cor: e.target.value })} autoComplete="off" />
        </Campo>
        <Campo label="Tipo">
          <select name="tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {NOME_TIPO[t]}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <Alerta focar>{erro}</Alerta>
      <div className="card-acoes">
        <button type="button" className="btn btn-pequeno" onClick={onCancelar}>
          Cancelar
        </button>
        <BotaoEnviar ocupado={ocupado} className="btn-primaria btn-pequeno" textoOcupado="Salvando…">
          Salvar veículo
        </BotaoEnviar>
      </div>
    </form>
  );
}

// Alteração do valor mensal de um plano (PUT /planos/:id).
function EditarValorPlano({ p, onSalvo, onCancelar }) {
  const [valor, setValor] = useState(String(p.valor_mensal));
  const { ocupado, erro, executar } = useAcao();
  return (
    <form
      className="edicao-inline"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await executar(() => api.atualizarPlano(p.id, { valor_mensal: Number(valor) }));
        if (r) onSalvo();
      }}
    >
      <div className="linha">
        <Campo label="Novo valor mensal (R$)">
          <input
            name="valor_mensal"
            type="number"
            inputMode="decimal"
            min="1"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            autoComplete="off"
            required
          />
        </Campo>
        <div className="fixo card-acoes" style={{ marginBottom: 14 }}>
          <button type="button" className="btn" onClick={onCancelar}>
            Cancelar
          </button>
          <BotaoEnviar ocupado={ocupado} textoOcupado="Salvando…">
            Salvar valor
          </BotaoEnviar>
        </div>
      </div>
      <Alerta focar>{erro}</Alerta>
    </form>
  );
}

function DetalheCliente({ id, garagens, onAlterado, onRemovido }) {
  const { dados: c, erro, carregando, recarregar } = useCarregar(() => api.cliente(id), [id]);
  const acao = useAcao();
  const [confirmar, dialogo] = useConfirmar();
  const [veiculo, setVeiculo] = useState({ placa: '', modelo: '', tipo: 'CARRO' });
  const [plano, setPlano] = useState({ garagem_id: '', valor_mensal: '' });
  // O que está em edição: 'cliente', 'v-<id>' (veículo) ou 'p-<id>' (plano).
  const [editando, setEditando] = useState(null);

  useEffect(() => setEditando(null), [id]);

  const salvo = async () => {
    setEditando(null);
    await recarregar();
    onAlterado();
  };

  const nomeGaragem = (gid) => garagens.find((g) => g._id === gid)?.nome || gid;

  const depois = async (fn) => {
    const r = await acao.executar(fn);
    if (r !== undefined) {
      await recarregar();
      onAlterado();
    }
    return r;
  };

  if (carregando && !c)
    return (
      <Card>
        <Carregando texto="Carregando cliente…" />
      </Card>
    );
  if (erro)
    return (
      <Card>
        <Alerta>{erro}</Alerta>
      </Card>
    );
  if (!c) return null;

  return (
    <div className="pilha">
      {dialogo}
      <Card
        id="cliente"
        titulo={c.nome}
        acoes={
          <>
            {editando !== 'cliente' && (
              <button type="button" className="btn btn-pequeno" onClick={() => setEditando('cliente')}>
                Editar dados
              </button>
            )}
            <button
              type="button"
              className="btn btn-pequeno btn-perigo"
              onClick={async () => {
                const ok = await confirmar({
                  titulo: `Excluir ${c.nome}?`,
                  texto: `Os ${c.veiculos.length} veículo(s) e ${c.planos.length} plano(s) do cliente também serão removidos. Essa ação não pode ser desfeita.`,
                  acao: 'Excluir cliente',
                });
                if (!ok) return;
                const r = await acao.executar(() => api.removerCliente(c.id));
                if (r !== undefined) onRemovido();
              }}
            >
              Excluir cliente
            </button>
          </>
        }
      >
        {editando === 'cliente' ? (
          <EditarCliente c={c} onSalvo={salvo} onCancelar={() => setEditando(null)} />
        ) : (
          <>
            <div className="chips" style={{ alignItems: 'center' }}>
              <Badge cor={c.tipo === 'MENSALISTA' ? 'azul' : 'cinza'}>
                {c.tipo === 'MENSALISTA' ? 'Mensalista' : 'Avulso'}
              </Badge>
              <span className="suave" translate="no">
                CPF {fmtCpf(c.cpf)}
              </span>
              {c.email && <span className="suave truncar">· {c.email}</span>}
              {c.telefone && <span className="suave">· {c.telefone}</span>}
            </div>
            <p className="nota" style={{ marginTop: 10 }}>
              O tipo é derivado: <b>mensalista</b> se existir um plano vigente; senão, <b>avulso</b>.
            </p>
          </>
        )}
      </Card>

      <Alerta focar onFechar={() => acao.setErro(null)}>
        {acao.erro}
      </Alerta>

      <Card titulo={`Veículos (${c.veiculos.length})`} id="veiculos">
        {c.veiculos.length === 0 && <Vazio titulo="Nenhum veículo">Adicione o primeiro abaixo.</Vazio>}
        {c.veiculos.map((v) =>
          editando === `v-${v.id}` ? (
            <EditarVeiculo key={v.id} v={v} onSalvo={salvo} onCancelar={() => setEditando(null)} />
          ) : (
            <div className="item-linha" key={v.id}>
              <div className="chips" style={{ alignItems: 'center' }}>
                <Placa>{v.placa}</Placa>
                <TipoVeiculo tipo={v.tipo} />
                <span className="suave truncar">{[v.modelo, v.cor].filter(Boolean).join(' · ')}</span>
              </div>
              <div className="card-acoes">
                <button
                  type="button"
                  className="btn btn-pequeno"
                  aria-label={`Editar veículo ${v.placa}`}
                  onClick={() => setEditando(`v-${v.id}`)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="btn btn-pequeno btn-perigo"
                  aria-label={`Remover veículo ${v.placa}`}
                  onClick={async () => {
                    const ok = await confirmar({
                      titulo: `Remover o veículo ${v.placa}?`,
                      texto: 'O histórico de sessões do veículo continua disponível nos relatórios.',
                      acao: 'Remover veículo',
                    });
                    if (ok) depois(() => api.removerVeiculo(v.id));
                  }}
                >
                  Remover
                </button>
              </div>
            </div>
          ),
        )}
        <form
          className="linha"
          style={{ marginTop: 14 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await depois(() => api.criarVeiculo({ cliente_id: c.id, ...veiculo }));
            if (r) setVeiculo({ placa: '', modelo: '', tipo: 'CARRO' });
          }}
        >
          <Campo label="Placa">
            <InputPlaca valor={veiculo.placa} onChange={(v) => setVeiculo({ ...veiculo, placa: v })} />
          </Campo>
          <Campo label="Modelo">
            <input
              name="modelo"
              value={veiculo.modelo}
              onChange={(e) => setVeiculo({ ...veiculo, modelo: e.target.value })}
              autoComplete="off"
              placeholder="ex.: Onix…"
            />
          </Campo>
          <Campo label="Tipo">
            <select name="tipo" value={veiculo.tipo} onChange={(e) => setVeiculo({ ...veiculo, tipo: e.target.value })}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {NOME_TIPO[t]}
                </option>
              ))}
            </select>
          </Campo>
          <div className="fixo" style={{ marginBottom: 14 }}>
            <BotaoEnviar ocupado={acao.ocupado} className="" textoOcupado="Adicionando…">
              Adicionar veículo
            </BotaoEnviar>
          </div>
        </form>
      </Card>

      <Card titulo="Planos de mensalista" id="planos">
        {c.planos.length === 0 && <Vazio titulo="Nenhum plano">O cliente é avulso e paga por permanência.</Vazio>}
        {c.planos.map((p) =>
          editando === `p-${p.id}` ? (
            <EditarValorPlano key={p.id} p={p} onSalvo={salvo} onCancelar={() => setEditando(null)} />
          ) : (
            <div className="item-linha" key={p.id}>
              <div>
                <strong>{nomeGaragem(p.garagem_id)}</strong>{' '}
                {p.vigente ? <Badge cor="verde">Vigente</Badge> : <Badge>Encerrado</Badge>}
                <div className="suave" style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                  {brl(p.valor_mensal)}/mês · desde {dia(p.data_inicio)}
                  {p.data_fim && ` até ${dia(p.data_fim)}`}
                </div>
              </div>
              <div className="card-acoes">
                {p.ativo && (
                  <button type="button" className="btn btn-pequeno" onClick={() => setEditando(`p-${p.id}`)}>
                    Alterar valor
                  </button>
                )}
                {!p.ativo && (
                  <button
                    type="button"
                    className="btn btn-pequeno btn-perigo"
                    aria-label={`Excluir plano encerrado de ${nomeGaragem(p.garagem_id)}`}
                    onClick={async () => {
                      const ok = await confirmar({
                        titulo: 'Excluir este plano encerrado?',
                        texto: 'O registro sai do histórico do cliente. Essa ação não pode ser desfeita.',
                        acao: 'Excluir plano',
                      });
                      if (ok) depois(() => api.removerPlano(p.id));
                    }}
                  >
                    Excluir
                  </button>
                )}
                {p.ativo && (
                  <button
                    type="button"
                    className="btn btn-pequeno"
                    onClick={async () => {
                      const ok = await confirmar({
                        titulo: 'Encerrar este plano?',
                        texto: `O cliente deixa de ser mensalista em ${nomeGaragem(p.garagem_id)} e passa a pagar por permanência a partir de hoje.`,
                        acao: 'Encerrar plano',
                      });
                      if (ok) depois(() => api.encerrarPlano(p.id));
                    }}
                  >
                    Encerrar plano
                  </button>
                )}
              </div>
            </div>
          ),
        )}
        <form
          className="linha"
          style={{ marginTop: 14 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await depois(() =>
              api.criarPlano({
                cliente_id: c.id,
                garagem_id: plano.garagem_id,
                valor_mensal: Number(plano.valor_mensal),
              }),
            );
            if (r) setPlano({ garagem_id: '', valor_mensal: '' });
          }}
        >
          <Campo label="Garagem">
            <SelectGaragem
              garagens={garagens}
              valor={plano.garagem_id}
              onChange={(v) => setPlano({ ...plano, garagem_id: v })}
              vazio="Selecione a garagem…"
            />
          </Campo>
          <Campo label="Valor mensal (R$)">
            <input
              name="valor_mensal"
              type="number"
              inputMode="decimal"
              min="1"
              step="0.01"
              value={plano.valor_mensal}
              onChange={(e) => setPlano({ ...plano, valor_mensal: e.target.value })}
              autoComplete="off"
              placeholder="ex.: 350…"
              required
            />
          </Campo>
          <div className="fixo" style={{ marginBottom: 14 }}>
            <BotaoEnviar ocupado={acao.ocupado} className="" textoOcupado="Criando plano…">
              Criar plano
            </BotaoEnviar>
          </div>
        </form>
        <p className="nota">
          A garagem é validada no Serviço de Garagens (<span translate="no">MongoDB</span>): integridade entre bancos
          feita pela aplicação. Um índice único parcial no <span translate="no">PostgreSQL</span> impede dois planos
          ativos na mesma garagem.
        </p>
      </Card>
    </div>
  );
}

export default function Clientes({ garagens }) {
  const [q, setQ] = useParamUrl('q');
  const [selId, setSelId] = useParamUrl('id');
  const [novo, setNovo] = useParamUrl('novo');
  const [busca, setBusca] = useState(q);
  const lista = useCarregar(() => api.clientes(q), [q]);

  // Busca com pequeno atraso enquanto digita (e grava na URL).
  useEffect(() => {
    const t = setTimeout(() => setQ(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca, setQ]);

  const sel = selId ? Number(selId) : null;

  return (
    <>
      <CabecalhoPagina
        titulo="Clientes"
        descricao="Clientes, veículos e planos de mensalista — dados relacionais no PostgreSQL."
        acoes={
          <a className="btn btn-primaria" href={linkCliente(null, q, { novo: '1' })}>
            Cadastrar cliente
          </a>
        }
      />
      <div className="grade grade-2">
        <Card titulo={`Lista${lista.dados ? ` (${lista.dados.length})` : ''}`} id="lista">
          <form role="search" onSubmit={(e) => e.preventDefault()}>
            <Campo label="Buscar por nome ou CPF">
              <input
                type="search"
                name="busca"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="ex.: Maria ou 123456…"
                autoComplete="off"
                spellCheck={false}
              />
            </Campo>
          </form>
          <Alerta>{lista.erro}</Alerta>
          {lista.carregando && !lista.dados && <Carregando texto="Carregando clientes…" />}
          {lista.dados?.length === 0 && (
            <Vazio titulo="Nenhum cliente encontrado">
              {q ? 'Tente outro nome ou CPF.' : 'Cadastre o primeiro cliente.'}
            </Vazio>
          )}
          {lista.dados?.length > 0 && (
            <ul className="lista-clientes">
              {lista.dados.map((c) => (
                <li key={c.id}>
                  <a href={linkCliente(c.id, q)} aria-current={sel === c.id ? 'true' : undefined}>
                    <div className="nome">
                      <span>{c.nome}</span>
                      <small translate="no">
                        {fmtCpf(c.cpf)} · {c.qtd_veiculos} veículo(s)
                      </small>
                    </div>
                    <Badge cor={c.tipo === 'MENSALISTA' ? 'azul' : 'cinza'}>
                      {c.tipo === 'MENSALISTA' ? 'Mensalista' : 'Avulso'}
                    </Badge>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="pilha">
          {novo && (
            <NovoCliente
              onCancelar={() => setNovo('', { replace: false })}
              onCriado={(id) => {
                window.location.hash = linkCliente(id, q).slice(1);
                lista.recarregar();
              }}
            />
          )}
          {!novo && sel && (
            <DetalheCliente
              id={sel}
              garagens={garagens}
              onAlterado={lista.recarregar}
              onRemovido={() => {
                setSelId('', { replace: false });
                lista.recarregar();
              }}
            />
          )}
          {!novo && !sel && (
            <Card>
              <Vazio titulo="Nenhum cliente selecionado">Escolha um cliente na lista ou cadastre um novo.</Vazio>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
