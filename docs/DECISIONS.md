# Registro de Decisões — NÓS

> Cada decisão importante entra aqui com o porquê. Antes de re-discutir algo, leia a entrada. Formato: D-nº · data · decisão · motivo.

- **D-01 · 2026-07-14 · Nome: NÓS.** Contrário de "Jogador Nº 1"; trocadilho triplo (nós = coletivo, nós = nós do grafo git, nós = rede). Decidido com o Tiago.
- **D-02 · 2026-07-14 · Repo público dedicado (`brigsd/nos`).** Actions ilimitado grátis, Pages grátis, contribuição comunitária. Decidido com o Tiago.
- **D-03 · 2026-07-14 · 100% GitHub.** Repo = banco, Actions = servidor, Pages = cliente, issues = comandos. É a tese do projeto; sem servidores externos.
- **D-04 · 2026-07-14 · Tick em lote, 1 commit por tick.** Escala com o tempo, não com jogadores; evita corrida de commits e histórico inchado.
- **D-05 · 2026-07-14 · Combate por turnos autoritativo (v2).** Resolvido pela engine no tick com seed determinística; cliente exibe replay. À prova de trapaça por arquitetura. PvP assíncrono.
- **D-06 · 2026-07-14 · TypeScript em engine e cliente.** Tipos compartilhados eliminam divergência entre servidor e apresentação.
- **D-07 · 2026-07-14 · Pages via artifact deploy.** Site publicado não entra no histórico git; repositório permanece leve indefinidamente.
- **D-08 · 2026-07-14 · Arte: pixel art 16×16, paleta Resurrect 64.** Estilo alcançável por sprites-como-código + packs CC0 (Kenney etc.); o art-reviewer valida visualmente.
- **D-09 · 2026-07-14 · NPCs v1/v2 sem LLM em runtime.** Árvores de comportamento + falas roteirizadas: determinístico, grátis e sem depender de API key. LLM é extensão opcional futura.
- **D-10 · 2026-07-14 · Estrutura de agentes + docs de continuidade.** Sugestão do Tiago: qualidade garantida por revisores especializados e progresso garantido por documentação de estado, não por memória de conversa.
- **D-11 · 2026-07-14 · Tick híbrido: relógio + evento.** Batida do mundo por cron (1h) E processamento de comandos disparado por evento de issue (~30–60s de latência percebida). `concurrency` do Actions aglutina comandos simultâneos num lote — 1 commit por execução segue valendo.
- **D-12 · 2026-07-14 · UI otimista no cliente.** Ação aparece na hora como "pendente" (fantasma) e reconcilia quando o tick confirma; movimento de terceiros interpolado entre batidas. A latência real fica invisível.
- **D-13 · 2026-07-14 · Login GitHub no site via OAuth device flow (v2).** Site estático autentica sem servidor e cria comandos via API por baixo dos panos — jogar sem sair do jogo. Fallback permanente: issue manual.
- **D-14 · 2026-07-14 · Notificações via resposta de issue.** O tick responde o comando na issue do jogador; o app oficial do GitHub entrega como push no celular. Notificação nativa, custo zero.
