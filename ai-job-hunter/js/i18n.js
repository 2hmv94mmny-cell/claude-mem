// Interface language.
//
// The app is written in English. Instead of threading a translate() call
// through every screen, a translator watches the page and swaps each known
// English text (text nodes, placeholders, aria-labels, titles) for the chosen
// language as it appears. Fixed texts are looked up in DICT; texts with
// numbers or names in them are matched by the PATTERNS below, and the parts
// they capture are translated again where they are known texts themselves.
//
// What is never translated: the CV and cover letter pages (they follow the
// job's language), job descriptions, and anything the user types.

export const LANGUAGES = [
  { code: 'en', name: 'English', locale: 'en-GB' },
  { code: 'de', name: 'Deutsch', locale: 'de-CH' },
  { code: 'fr', name: 'Français', locale: 'fr-CH' },
  { code: 'it', name: 'Italiano', locale: 'it-CH' },
  { code: 'es', name: 'Español', locale: 'es-ES' },
  { code: 'pt', name: 'Português', locale: 'pt-BR' },
];
const COL = { de: 0, fr: 1, it: 2, es: 3, pt: 4 };

// English: [German, French, Italian, Spanish, Portuguese]
const DICT = {
  // App shell
  'Vora': ['Vora', 'Vora', 'Vora', 'Vora', 'Vora'],
  'Skip to content': ['Zum Inhalt springen', 'Aller au contenu', 'Vai al contenuto', 'Ir al contenido', 'Pular para o conteúdo'],
  'Home': ['Start', 'Accueil', 'Home', 'Inicio', 'Início'],
  'Find jobs': ['Jobs finden', 'Emplois', 'Trova lavoro', 'Buscar empleo', 'Encontrar vagas'],
  'Applications': ['Bewerbungen', 'Candidatures', 'Candidature', 'Candidaturas', 'Candidaturas'],
  'Profile & CV': ['Profil & Lebenslauf', 'Profil & CV', 'Profilo & CV', 'Perfil y CV', 'Perfil e currículo'],
  'Profile': ['Profil', 'Profil', 'Profilo', 'Perfil', 'Perfil'],
  'Settings': ['Einstellungen', 'Paramètres', 'Impostazioni', 'Ajustes', 'Configurações'],
  'Main': ['Hauptmenü', 'Menu principal', 'Menu principale', 'Menú principal', 'Menu principal'],
  'Install app': ['App installieren', "Installer l'app", "Installa l'app", 'Instalar app', 'Instalar app'],
  'Sign in': ['Anmelden', 'Se connecter', 'Accedi', 'Iniciar sesión', 'Entrar'],
  'Vora needs JavaScript enabled.': ['Vora braucht JavaScript.', 'Vora nécessite JavaScript.', 'Vora richiede JavaScript.', 'Vora necesita JavaScript.', 'O Vora precisa de JavaScript.'],

  // Common
  'Remote': ['Remote', 'Télétravail', 'Da remoto', 'Remoto', 'Remoto'],
  'Hybrid': ['Hybrid', 'Hybride', 'Ibrido', 'Híbrido', 'Híbrido'],
  'On-site': ['Vor Ort', 'Sur site', 'In sede', 'Presencial', 'Presencial'],
  'Full-time': ['Vollzeit', 'Temps plein', 'Tempo pieno', 'Jornada completa', 'Tempo integral'],
  'Part-time': ['Teilzeit', 'Temps partiel', 'Part-time', 'Media jornada', 'Meio período'],
  'Contract': ['Befristet', 'CDD', 'Contratto a termine', 'Temporal', 'Temporário'],
  'Freelance': ['Freelance', 'Freelance', 'Freelance', 'Autónomo', 'Freelancer'],
  'Internship': ['Praktikum', 'Stage', 'Stage', 'Prácticas', 'Estágio'],
  'Save': ['Speichern', 'Enregistrer', 'Salva', 'Guardar', 'Salvar'],
  'Saved': ['Gespeichert', 'Enregistré', 'Salvato', 'Guardado', 'Salvo'],
  'Open': ['Öffnen', 'Ouvrir', 'Apri', 'Abrir', 'Abrir'],
  'Close': ['Schliessen', 'Fermer', 'Chiudi', 'Cerrar', 'Fechar'],
  'Edit': ['Bearbeiten', 'Modifier', 'Modifica', 'Editar', 'Editar'],
  'Done': ['Fertig', 'Terminé', 'Fatto', 'Listo', 'Pronto'],
  'Refresh': ['Aktualisieren', 'Actualiser', 'Aggiorna', 'Actualizar', 'Atualizar'],
  'Search': ['Suchen', 'Rechercher', 'Cerca', 'Buscar', 'Buscar'],
  'Search jobs': ['Jobs suchen', 'Rechercher', 'Cerca lavoro', 'Buscar empleo', 'Buscar vagas'],
  'Searching…': ['Suche läuft…', 'Recherche…', 'Ricerca…', 'Buscando…', 'Buscando…'],
  'Try again': ['Erneut versuchen', 'Réessayer', 'Riprova', 'Reintentar', 'Tentar de novo'],
  'Working…': ['Läuft…', 'En cours…', 'In corso…', 'Trabajando…', 'Processando…'],
  'Thinking…': ['Denkt nach…', 'Réflexion…', 'Sto pensando…', 'Pensando…', 'Pensando…'],
  'Stopped': ['Gestoppt', 'Arrêté', 'Interrotto', 'Detenido', 'Interrompido'],
  'Still searching, more jobs will appear…': ['Suche läuft noch, weitere Jobs erscheinen gleich…', 'Recherche en cours, d’autres offres vont apparaître…', 'Ricerca in corso, altre offerte in arrivo…', 'Seguimos buscando, aparecerán más empleos…', 'Ainda buscando, mais vagas vão aparecer…'],
  'Your job search pipeline, from saved to offer.': ['Deine Jobsuche im Überblick, vom Merken bis zum Angebot.', 'Votre recherche d’emploi, de l’offre enregistrée à la proposition.', 'La tua ricerca di lavoro, dal salvataggio all’offerta.', 'Tu búsqueda de empleo, de guardado a oferta.', 'Sua busca de emprego, do salvo à oferta.'],
  'Tracked': ['Erfasst', 'Suivies', 'Monitorate', 'Seguidas', 'Acompanhadas'],
  'Interviews': ['Interviews', 'Entretiens', 'Colloqui', 'Entrevistas', 'Entrevistas'],
  'Offers': ['Angebote', 'Offres', 'Offerte', 'Ofertas', 'Ofertas'],
  'Response rate': ['Antwortquote', 'Taux de réponse', 'Tasso di risposta', 'Tasa de respuesta', 'Taxa de resposta'],
  'none this week': ['keine diese Woche', 'aucune cette semaine', 'nessuna questa settimana', 'ninguna esta semana', 'nenhuma esta semana'],
  'none in progress': ['keine laufend', 'aucun en cours', 'nessuno in corso', 'ninguna en curso', 'nenhuma em andamento'],
  'congratulations': ['Glückwunsch', 'félicitations', 'congratulazioni', 'enhorabuena', 'parabéns'],
  'keep going': ['dranbleiben', 'continuez', 'continua così', 'sigue así', 'continue'],
  'apply to see it': ['bewirb dich, um sie zu sehen', 'postulez pour le voir', 'candidati per vederlo', 'postula para verla', 'candidate-se para ver'],
  'Search title or company': ['Titel oder Firma suchen', 'Rechercher un poste ou une entreprise', 'Cerca ruolo o azienda', 'Buscar puesto o empresa', 'Buscar cargo ou empresa'],
  'Search applications': ['Bewerbungen durchsuchen', 'Rechercher dans les candidatures', 'Cerca candidature', 'Buscar candidaturas', 'Buscar candidaturas'],
  'Sort by': ['Sortieren nach', 'Trier par', 'Ordina per', 'Ordenar por', 'Ordenar por'],
  'Recently updated': ['Zuletzt aktualisiert', 'Mises à jour récentes', 'Aggiornate di recente', 'Actualizadas recientemente', 'Atualizadas recentemente'],
  'Best match': ['Beste Übereinstimmung', 'Meilleure correspondance', 'Migliore corrispondenza', 'Mejor coincidencia', 'Melhor correspondência'],
  'Company A–Z': ['Firma A–Z', 'Entreprise A–Z', 'Azienda A–Z', 'Empresa A–Z', 'Empresa A–Z'],
  'Board': ['Board', 'Tableau', 'Bacheca', 'Tablero', 'Quadro'],
  'List': ['Liste', 'Liste', 'Elenco', 'Lista', 'Lista'],
  'View': ['Ansicht', 'Affichage', 'Vista', 'Vista', 'Visualização'],
  'Pipeline summary': ['Übersicht', 'Résumé', 'Riepilogo', 'Resumen', 'Resumo'],
  'Move to': ['Verschieben nach', 'Déplacer vers', 'Sposta in', 'Mover a', 'Mover para'],
  'Open job': ['Job öffnen', 'Ouvrir l’offre', 'Apri offerta', 'Abrir empleo', 'Abrir vaga'],
  'Remove': ['Entfernen', 'Retirer', 'Rimuovi', 'Quitar', 'Remover'],
  'Actions': ['Aktionen', 'Actions', 'Azioni', 'Acciones', 'Ações'],
  'All': ['Alle', 'Toutes', 'Tutte', 'Todas', 'Todas'],
  'today': ['heute', 'aujourd’hui', 'oggi', 'hoy', 'hoje'],
  'yesterday': ['gestern', 'hier', 'ieri', 'ayer', 'ontem'],
  'Next': ['Als Nächstes', 'Ensuite', 'Poi', 'Siguiente', 'Próximo'],
  'Next step': ['Nächster Schritt', 'Prochaine étape', 'Prossimo passo', 'Siguiente paso', 'Próximo passo'],
  'Role': ['Stelle', 'Poste', 'Ruolo', 'Puesto', 'Cargo'],
  'Stage': ['Phase', 'Étape', 'Fase', 'Etapa', 'Etapa'],
  'Match': ['Match', 'Correspondance', 'Corrispondenza', 'Coincidencia', 'Compatibilidade'],
  'Activity': ['Aktivität', 'Activité', 'Attività', 'Actividad', 'Atividade'],
  'Tailor your CV and apply': ['Lebenslauf anpassen und bewerben', 'Adaptez votre CV et postulez', 'Adatta il CV e candidati', 'Adapta tu CV y postula', 'Adapte seu currículo e candidate-se'],
  'Follow up with the recruiter': ['Beim Recruiter nachfassen', 'Relancez le recruteur', 'Ricontatta il recruiter', 'Haz seguimiento con el reclutador', 'Faça follow-up com o recrutador'],
  'Waiting for a reply': ['Warten auf Antwort', 'En attente de réponse', 'In attesa di risposta', 'Esperando respuesta', 'Aguardando resposta'],
  'Practise for the interview': ['Für das Interview üben', 'Préparez l’entretien', 'Esercitati per il colloquio', 'Practica para la entrevista', 'Pratique para a entrevista'],
  'Review and negotiate the offer': ['Angebot prüfen und verhandeln', 'Étudiez et négociez l’offre', 'Valuta e negozia l’offerta', 'Revisa y negocia la oferta', 'Revise e negocie a oferta'],
  'Ask for feedback, keep going': ['Feedback einholen, dranbleiben', 'Demandez un retour, continuez', 'Chiedi un feedback, vai avanti', 'Pide feedback y sigue', 'Peça feedback e siga em frente'],
  'Save jobs from search to start': ['Merke dir Jobs aus der Suche, um zu starten', 'Enregistrez des offres depuis la recherche pour commencer', 'Salva offerte dalla ricerca per iniziare', 'Guarda empleos desde la búsqueda para empezar', 'Salve vagas da busca para começar'],
  'Drag a card here': ['Karte hierher ziehen', 'Glissez une carte ici', 'Trascina qui una scheda', 'Arrastra una tarjeta aquí', 'Arraste um cartão para cá'],
  'No applications in this stage.': ['Keine Bewerbungen in dieser Phase.', 'Aucune candidature à cette étape.', 'Nessuna candidatura in questa fase.', 'No hay candidaturas en esta etapa.', 'Nenhuma candidatura nesta etapa.'],
  'Track every application in one place': ['Alle Bewerbungen an einem Ort', 'Toutes vos candidatures au même endroit', 'Tutte le candidature in un unico posto', 'Todas tus candidaturas en un solo lugar', 'Todas as candidaturas em um só lugar'],
  'Save jobs from your matches or search, then move them from Saved to Applied, Interview and Offer. Vora tells you the next step for each one.': ['Merke dir Jobs aus deinen Treffern oder der Suche und verschiebe sie von Gemerkt zu Beworben, Interview und Angebot. Vora sagt dir jeweils den nächsten Schritt.', 'Enregistrez des offres depuis vos correspondances ou la recherche, puis faites-les passer d’Enregistrée à Postulée, Entretien et Offre. Vora vous indique la prochaine étape pour chacune.', 'Salva offerte dai tuoi abbinamenti o dalla ricerca, poi spostale da Salvata a Candidata, Colloquio e Offerta. Vora ti indica il prossimo passo per ognuna.', 'Guarda empleos de tus coincidencias o de la búsqueda y muévelos de Guardado a Postulado, Entrevista y Oferta. Vora te dice el siguiente paso de cada uno.', 'Salve vagas das suas correspondências ou da busca e mova-as de Salva para Candidatada, Entrevista e Oferta. A Vora indica o próximo passo de cada uma.'],
  'Top picks for you': ['Top-Treffer für dich', 'Sélection pour vous', 'I migliori per te', 'Selección para ti', 'Destaques para você'],
  'Pick up where you left off': ['Mach weiter, wo du aufgehört hast', 'Reprenez là où vous en étiez', 'Riprendi da dove eri rimasto', 'Retoma donde lo dejaste', 'Continue de onde parou'],
  'All applications': ['Alle Bewerbungen', 'Toutes les candidatures', 'Tutte le candidature', 'Todas las candidaturas', 'Todas as candidaturas'],
  'Your job search': ['Deine Jobsuche', 'Votre recherche d’emploi', 'La tua ricerca di lavoro', 'Tu búsqueda de empleo', 'Sua busca de emprego'],
  'Getting started': ['Erste Schritte', 'Pour bien démarrer', 'Per iniziare', 'Primeros pasos', 'Primeiros passos'],
  'Recent searches': ['Letzte Suchen', 'Recherches récentes', 'Ricerche recenti', 'Búsquedas recientes', 'Buscas recentes'],
  'Here is what is new in your job search today.': ['Das ist heute neu in deiner Jobsuche.', 'Voici les nouveautés de votre recherche aujourd’hui.', 'Ecco le novità della tua ricerca di oggi.', 'Esto es lo nuevo en tu búsqueda de hoy.', 'Veja o que há de novo na sua busca hoje.'],
  'Save a job to start tracking your applications.': ['Merke dir einen Job, um deine Bewerbungen zu verfolgen.', 'Enregistrez une offre pour suivre vos candidatures.', 'Salva un’offerta per seguire le tue candidature.', 'Guarda un empleo para seguir tus candidaturas.', 'Salve uma vaga para acompanhar suas candidaturas.'],
  'Complete. Vora has everything it needs to match you.': ['Vollständig. Vora hat alles, um passende Jobs zu finden.', 'Complet. Vora a tout ce qu’il faut pour vous trouver des offres.', 'Completo. Vora ha tutto ciò che serve per abbinarti.', 'Completo. Vora tiene todo lo necesario para encontrarte empleos.', 'Completo. A Vora tem tudo para encontrar vagas para você.'],
  'Removed from saved jobs': ['Aus gespeicherten Jobs entfernt', 'Retirée des offres enregistrées', 'Rimossa dalle offerte salvate', 'Quitado de los empleos guardados', 'Removida das vagas salvas'],
  'Already in your applications': ['Schon in deinen Bewerbungen', 'Déjà dans vos candidatures', 'Già nelle tue candidature', 'Ya está en tus candidaturas', 'Já está nas suas candidaturas'],
  'Look for new jobs now': ['Jetzt nach neuen Jobs suchen', 'Chercher de nouvelles offres', 'Cerca nuove offerte ora', 'Buscar empleos nuevos ahora', 'Buscar vagas novas agora'],
  'For you': ['Für dich', 'Pour vous', 'Per te', 'Para ti', 'Para você'],
  'Documents': ['Dokumente', 'Documents', 'Documenti', 'Documentos', 'Documentos'],
  'Undo': ['Rückgängig', 'Annuler', 'Annulla', 'Deshacer', 'Desfazer'],
  'Redo': ['Wiederholen', 'Rétablir', 'Ripeti', 'Rehacer', 'Refazer'],
  'Undo (Ctrl+Z)': ['Rückgängig (Strg+Z)', 'Annuler (Ctrl+Z)', 'Annulla (Ctrl+Z)', 'Deshacer (Ctrl+Z)', 'Desfazer (Ctrl+Z)'],
  'Redo (Ctrl+Shift+Z)': ['Wiederholen (Strg+Umschalt+Z)', 'Rétablir (Ctrl+Maj+Z)', 'Ripeti (Ctrl+Maiusc+Z)', 'Rehacer (Ctrl+Mayús+Z)', 'Refazer (Ctrl+Shift+Z)'],
  'Zoom': ['Zoom', 'Zoom', 'Zoom', 'Zoom', 'Zoom'],
  'Fit': ['Einpassen', 'Ajuster', 'Adatta', 'Ajustar', 'Ajustar'],
  'Outline': ['Gliederung', 'Plan', 'Struttura', 'Esquema', 'Estrutura'],
  'Design': ['Design', 'Mise en page', 'Design', 'Diseño', 'Design'],
  'Formatting': ['Formatierung', 'Mise en forme', 'Formattazione', 'Formato', 'Formatação'],
  'Insert': ['Einfügen', 'Insérer', 'Inserisci', 'Insertar', 'Inserir'],
  'Job': ['Stelle', 'Poste', 'Lavoro', 'Empleo', 'Emprego'],
  'Project': ['Projekt', 'Projet', 'Progetto', 'Proyecto', 'Projeto'],
  'Skill group': ['Kompetenzgruppe', 'Groupe de compétences', 'Gruppo di competenze', 'Grupo de habilidades', 'Grupo de habilidades'],
  'Profile summary': ['Kurzprofil', 'Résumé du profil', 'Profilo', 'Resumen del perfil', 'Resumo do perfil'],
  'Improve the wording': ['Formulierungen verbessern', 'Améliorer la formulation', 'Migliora la formulazione', 'Mejorar la redacción', 'Melhorar a redação'],
  'Clearer, stronger bullets': ['Klarere, stärkere Stichpunkte', 'Des puces plus claires et plus fortes', 'Punti più chiari e incisivi', 'Viñetas más claras y fuertes', 'Tópicos mais claros e fortes'],
  'Fit on one page': ['Auf eine Seite kürzen', 'Tenir sur une page', 'Stare in una pagina', 'Que quepa en una página', 'Caber em uma página'],
  'Trim older and weaker points': ['Ältere und schwächere Punkte kürzen', 'Réduire les points anciens ou faibles', 'Riduci i punti vecchi o deboli', 'Recortar puntos antiguos o débiles', 'Cortar pontos antigos ou fracos'],
  'Fix spelling and grammar': ['Rechtschreibung und Grammatik korrigieren', 'Corriger l’orthographe et la grammaire', 'Correggi ortografia e grammatica', 'Corregir ortografía y gramática', 'Corrigir ortografia e gramática'],
  'Write a profile summary': ['Kurzprofil schreiben', 'Rédiger un résumé du profil', 'Scrivi un profilo', 'Escribir un resumen del perfil', 'Escrever um resumo do perfil'],
  'Write a new general letter': ['Neues allgemeines Anschreiben schreiben', 'Rédiger une nouvelle lettre générale', 'Scrivi una nuova lettera generica', 'Escribir una nueva carta general', 'Escrever uma nova carta geral'],
  'For your target roles': ['Für deine Wunschstellen', 'Pour vos postes visés', 'Per i ruoli che cerchi', 'Para los puestos que buscas', 'Para os cargos que você busca'],
  'Make it shorter': ['Kürzer machen', 'Raccourcir', 'Accorcia', 'Acortar', 'Encurtar'],
  'More formal': ['Förmlicher', 'Plus formel', 'Più formale', 'Más formal', 'Mais formal'],
  'Warmer and more personal': ['Wärmer und persönlicher', 'Plus chaleureux et personnel', 'Più caloroso e personale', 'Más cálida y personal', 'Mais calorosa e pessoal'],
  'Ask Vora to change something': ['Bitte Vora um eine Änderung', 'Demander une modification à Vora', 'Chiedi a Vora di cambiare qualcosa', 'Pide a Vora que cambie algo', 'Peça à Vora para mudar algo'],
  'Apply': ['Anwenden', 'Appliquer', 'Applica', 'Aplicar', 'Aplicar'],
  'e.g. stress leadership, shorten the 2016 job': ['z. B. Führung betonen, die Stelle von 2016 kürzen', 'ex. mettre en avant le leadership, raccourcir le poste de 2016', 'es. evidenzia la leadership, accorcia il lavoro del 2016', 'p. ej. destacar el liderazgo, acortar el empleo de 2016', 'ex.: destacar liderança, encurtar o emprego de 2016'],
  'e.g. mention I can start in March': ['z. B. erwähnen, dass ich im März anfangen kann', 'ex. préciser que je peux commencer en mars', 'es. dire che posso iniziare a marzo', 'p. ej. mencionar que puedo empezar en marzo', 'ex.: mencionar que posso começar em março'],
  'Click any text to edit. Enter adds a bullet.': ['Klicke auf einen Text, um ihn zu ändern. Enter fügt einen Stichpunkt hinzu.', 'Cliquez sur un texte pour le modifier. Entrée ajoute une puce.', 'Clicca su un testo per modificarlo. Invio aggiunge un punto.', 'Haz clic en un texto para editarlo. Intro añade una viñeta.', 'Clique em um texto para editar. Enter adiciona um tópico.'],
  'Click any text to edit. Leave an empty line between paragraphs.': ['Klicke auf einen Text, um ihn zu ändern. Lass eine Leerzeile zwischen Absätzen.', 'Cliquez sur un texte pour le modifier. Laissez une ligne vide entre les paragraphes.', 'Clicca su un testo per modificarlo. Lascia una riga vuota tra i paragrafi.', 'Haz clic en un texto para editarlo. Deja una línea vacía entre párrafos.', 'Clique em um texto para editar. Deixe uma linha em branco entre parágrafos.'],
  'Start your CV to see the editing tools.': ['Starte deinen Lebenslauf, um die Werkzeuge zu sehen.', 'Commencez votre CV pour voir les outils.', 'Inizia il CV per vedere gli strumenti.', 'Empieza tu CV para ver las herramientas.', 'Comece seu currículo para ver as ferramentas.'],
  'Start your letter to see the editing tools.': ['Starte dein Anschreiben, um die Werkzeuge zu sehen.', 'Commencez votre lettre pour voir les outils.', 'Inizia la lettera per vedere gli strumenti.', 'Empieza tu carta para ver las herramientas.', 'Comece sua carta para ver as ferramentas.'],
  'Name and contact': ['Name und Kontakt', 'Nom et coordonnées', 'Nome e contatti', 'Nombre y contacto', 'Nome e contato'],
  'Letterhead': ['Briefkopf', 'En-tête', 'Intestazione', 'Membrete', 'Cabeçalho'],
  'Place and date': ['Ort und Datum', 'Lieu et date', 'Luogo e data', 'Lugar y fecha', 'Local e data'],
  'Recipient': ['Empfänger', 'Destinataire', 'Destinatario', 'Destinatario', 'Destinatário'],
  'Subject': ['Betreff', 'Objet', 'Oggetto', 'Asunto', 'Assunto'],
  'Letter': ['Brief', 'Lettre', 'Lettera', 'Carta', 'Carta'],
  'Match my CV template': ['Vorlage meines Lebenslaufs verwenden', 'Reprendre le modèle de mon CV', 'Usa il modello del mio CV', 'Usar la plantilla de mi CV', 'Usar o modelo do meu currículo'],
  'Pick a template once your document is started.': ['Wähle eine Vorlage, sobald dein Dokument begonnen ist.', 'Choisissez un modèle une fois le document commencé.', 'Scegli un modello dopo aver iniziato il documento.', 'Elige una plantilla cuando empieces el documento.', 'Escolha um modelo depois de começar o documento.'],
  'No CV yet': ['Noch kein Lebenslauf', 'Pas encore de CV', 'Ancora nessun CV', 'Aún no hay CV', 'Ainda sem currículo'],
  'No letter yet': ['Noch kein Anschreiben', 'Pas encore de lettre', 'Ancora nessuna lettera', 'Aún no hay carta', 'Ainda sem carta'],
  'Copy as plain text': ['Als reinen Text kopieren', 'Copier en texte brut', 'Copia come testo', 'Copiar como texto', 'Copiar como texto'],
  'Download as text file': ['Als Textdatei herunterladen', 'Télécharger en fichier texte', 'Scarica come file di testo', 'Descargar como texto', 'Baixar como texto'],
  'Lay out again from my profile CV': ['Erneut aus meinem Profil-Lebenslauf aufbauen', 'Remettre en page depuis le CV du profil', 'Reimpagina dal CV del profilo', 'Volver a maquetar desde el CV del perfil', 'Diagramar de novo a partir do currículo do perfil'],
  'Start over (blank)': ['Neu beginnen (leer)', 'Recommencer (vierge)', 'Ricomincia (vuoto)', 'Empezar de nuevo (en blanco)', 'Recomeçar (em branco)'],
  'More': ['Mehr', 'Plus', 'Altro', 'Más', 'Mais'],
  'Your CV, ready to edit like a Word page': ['Dein Lebenslauf, bearbeitbar wie eine Word-Seite', 'Votre CV, modifiable comme une page Word', 'Il tuo CV, modificabile come una pagina Word', 'Tu CV, editable como una página de Word', 'Seu currículo, editável como uma página do Word'],
  'A cover letter you can send anywhere': ['Ein Anschreiben für jede Bewerbung', 'Une lettre à envoyer partout', 'Una lettera da inviare ovunque', 'Una carta que puedes enviar a cualquier sitio', 'Uma carta para enviar a qualquer empresa'],
  'Vora lays out the CV from your profile in a professional template, word for word. Then click any text to change it, switch templates and colours, and download a PDF.': ['Vora setzt den Lebenslauf aus deinem Profil Wort für Wort in eine professionelle Vorlage. Dann klickst du auf einen Text, um ihn zu ändern, wechselst Vorlagen und Farben und lädst ein PDF herunter.', 'Vora met en page le CV de votre profil dans un modèle professionnel, mot pour mot. Cliquez ensuite sur un texte pour le modifier, changez de modèle et de couleur, et téléchargez un PDF.', 'Vora impagina il CV del tuo profilo in un modello professionale, parola per parola. Poi clicca su un testo per cambiarlo, cambia modello e colori e scarica un PDF.', 'Vora maqueta el CV de tu perfil en una plantilla profesional, palabra por palabra. Luego haz clic en un texto para cambiarlo, cambia plantilla y colores y descarga un PDF.', 'A Vora diagrama o currículo do seu perfil em um modelo profissional, palavra por palavra. Depois clique em um texto para mudar, troque modelos e cores e baixe um PDF.'],
  'A general letter for the roles you want, laid out as a proper business letter in the same template as your CV. Edit it on the page and download it as a PDF.': ['Ein allgemeines Anschreiben für deine Wunschstellen, als richtiger Geschäftsbrief in der Vorlage deines Lebenslaufs. Bearbeite es auf der Seite und lade es als PDF herunter.', 'Une lettre générale pour les postes visés, mise en page comme une vraie lettre dans le modèle de votre CV. Modifiez-la sur la page et téléchargez-la en PDF.', 'Una lettera generica per i ruoli che cerchi, impaginata come una vera lettera nel modello del tuo CV. Modificala sulla pagina e scaricala in PDF.', 'Una carta general para los puestos que buscas, maquetada como una carta formal en la plantilla de tu CV. Edítala en la página y descárgala en PDF.', 'Uma carta geral para os cargos que você busca, diagramada como carta formal no modelo do seu currículo. Edite na página e baixe em PDF.'],
  'Lay out my CV with Vora': ['Lebenslauf mit Vora aufbauen', 'Mettre mon CV en page avec Vora', 'Impagina il mio CV con Vora', 'Maquetar mi CV con Vora', 'Diagramar meu currículo com a Vora'],
  'Upload your CV first': ['Lade zuerst deinen Lebenslauf hoch', 'Importez d’abord votre CV', 'Carica prima il tuo CV', 'Sube primero tu CV', 'Envie primeiro seu currículo'],
  'Start from a blank page': ['Mit leerer Seite beginnen', 'Partir d’une page vierge', 'Inizia da una pagina vuota', 'Empezar con una página en blanco', 'Começar com uma página em branco'],
  'Write a general letter with Vora': ['Allgemeines Anschreiben mit Vora schreiben', 'Rédiger une lettre générale avec Vora', 'Scrivi una lettera generica con Vora', 'Escribir una carta general con Vora', 'Escrever uma carta geral com a Vora'],
  'Vora is laying out your CV…': ['Vora baut deinen Lebenslauf auf…', 'Vora met votre CV en page…', 'Vora sta impaginando il tuo CV…', 'Vora está maquetando tu CV…', 'A Vora está diagramando seu currículo…'],
  'Laying out your CV…': ['Lebenslauf wird aufgebaut…', 'Mise en page du CV…', 'Impaginazione del CV…', 'Maquetando tu CV…', 'Diagramando seu currículo…'],
  'Vora is editing your document…': ['Vora bearbeitet dein Dokument…', 'Vora modifie votre document…', 'Vora sta modificando il documento…', 'Vora está editando tu documento…', 'A Vora está editando seu documento…'],
  'Improving the wording…': ['Formulierungen werden verbessert…', 'Amélioration de la formulation…', 'Miglioramento della formulazione…', 'Mejorando la redacción…', 'Melhorando a redação…'],
  'Making it fit on one page…': ['Wird auf eine Seite gekürzt…', 'Mise sur une page…', 'Riduzione a una pagina…', 'Ajustando a una página…', 'Ajustando para uma página…'],
  'Checking spelling and grammar…': ['Rechtschreibung und Grammatik werden geprüft…', 'Vérification de l’orthographe…', 'Controllo di ortografia e grammatica…', 'Revisando ortografía y gramática…', 'Verificando ortografia e gramática…'],
  'Writing your profile…': ['Kurzprofil wird geschrieben…', 'Rédaction du profil…', 'Scrittura del profilo…', 'Escribiendo tu perfil…', 'Escrevendo seu perfil…'],
  'Vora is writing your letter…': ['Vora schreibt dein Anschreiben…', 'Vora rédige votre lettre…', 'Vora sta scrivendo la lettera…', 'Vora está escribiendo tu carta…', 'A Vora está escrevendo sua carta…'],
  'Shortening your letter…': ['Anschreiben wird gekürzt…', 'Raccourcissement de la lettre…', 'Accorciamento della lettera…', 'Acortando tu carta…', 'Encurtando sua carta…'],
  'Adjusting the tone…': ['Ton wird angepasst…', 'Ajustement du ton…', 'Regolazione del tono…', 'Ajustando el tono…', 'Ajustando o tom…'],
  'Set up the AI in Settings to use Vora AI.': ['Richte die KI in den Einstellungen ein, um Vora KI zu nutzen.', 'Configurez l’IA dans les paramètres pour utiliser l’IA Vora.', 'Configura l’IA nelle impostazioni per usare Vora.', 'Configura la IA en Ajustes para usar Vora.', 'Configure a IA nas configurações para usar a Vora.'],
  'Vora could not finish that. Try again.': ['Vora konnte das nicht abschliessen. Versuche es erneut.', 'Vora n’a pas pu terminer. Réessayez.', 'Vora non è riuscita a finire. Riprova.', 'Vora no pudo terminarlo. Inténtalo de nuevo.', 'A Vora não conseguiu terminar. Tente de novo.'],
  'Saved. Vora saves as you type.': ['Gespeichert. Vora speichert beim Tippen.', 'Enregistré. Vora enregistre pendant la saisie.', 'Salvato. Vora salva mentre scrivi.', 'Guardado. Vora guarda mientras escribes.', 'Salvo. A Vora salva enquanto você digita.'],
  'My CV': ['Mein Lebenslauf', 'Mon CV', 'Il mio CV', 'Mi CV', 'Meu currículo'],
  'My cover letter': ['Mein Anschreiben', 'Ma lettre de motivation', 'La mia lettera', 'Mi carta', 'Minha carta'],
  'Start a blank CV? Your current one is replaced (Undo brings it back).': ['Leeren Lebenslauf beginnen? Der aktuelle wird ersetzt (Rückgängig holt ihn zurück).', 'Commencer un CV vierge ? L’actuel sera remplacé (Annuler le rétablit).', 'Iniziare un CV vuoto? Quello attuale viene sostituito (Annulla lo ripristina).', '¿Empezar un CV en blanco? El actual se reemplaza (Deshacer lo recupera).', 'Começar um currículo em branco? O atual será substituído (Desfazer o traz de volta).'],
  'Start a blank letter? The current one is replaced (Undo brings it back).': ['Leeres Anschreiben beginnen? Das aktuelle wird ersetzt (Rückgängig holt es zurück).', 'Commencer une lettre vierge ? L’actuelle sera remplacée (Annuler la rétablit).', 'Iniziare una lettera vuota? Quella attuale viene sostituita (Annulla la ripristina).', '¿Empezar una carta en blanco? La actual se reemplaza (Deshacer la recupera).', 'Começar uma carta em branco? A atual será substituída (Desfazer a traz de volta).'],
  'Experience': ['Berufserfahrung', 'Expérience', 'Esperienza', 'Experiencia', 'Experiência'],
  'Education': ['Ausbildung', 'Formation', 'Formazione', 'Formación', 'Formação'],
  'Certifications': ['Zertifikate', 'Certifications', 'Certificazioni', 'Certificaciones', 'Certificações'],
  'Projects': ['Projekte', 'Projets', 'Progetti', 'Proyectos', 'Projetos'],
  'Laying out your CV': ['Dein Lebenslauf wird aufgebaut', 'Mise en page de votre CV', 'Impaginazione del tuo CV', 'Maquetando tu CV', 'Diagramando seu currículo'],
  'Writing your CV for this job': ['Dein Lebenslauf für diese Stelle', 'Votre CV pour ce poste', 'Il tuo CV per questa offerta', 'Tu CV para este empleo', 'Seu currículo para esta vaga'],
  'Writing your cover letter': ['Dein Anschreiben wird geschrieben', 'Rédaction de votre lettre', 'Scrittura della tua lettera', 'Escribiendo tu carta', 'Escrevendo sua carta'],
  'Updating your document': ['Dein Dokument wird aktualisiert', 'Mise à jour du document', 'Aggiornamento del documento', 'Actualizando tu documento', 'Atualizando seu documento'],
  'Reading your CV': ['Lebenslauf wird gelesen', 'Lecture de votre CV', 'Lettura del CV', 'Leyendo tu CV', 'Lendo seu currículo'],
  'Finding each section': ['Abschnitte werden erkannt', 'Repérage des sections', 'Individuazione delle sezioni', 'Detectando cada sección', 'Identificando as seções'],
  'Placing every line in the template': ['Jede Zeile kommt in die Vorlage', 'Placement de chaque ligne dans le modèle', 'Ogni riga nel modello', 'Colocando cada línea en la plantilla', 'Colocando cada linha no modelo'],
  'Checking nothing is left out': ['Prüfen, dass nichts fehlt', 'Vérification que rien ne manque', 'Controllo che non manchi nulla', 'Comprobando que no falte nada', 'Conferindo que nada ficou de fora'],
  'Reading the job posting': ['Inserat wird gelesen', 'Lecture de l’annonce', 'Lettura dell’annuncio', 'Leyendo la oferta', 'Lendo a vaga'],
  'Matching your experience to it': ['Deine Erfahrung wird abgeglichen', 'Rapprochement avec votre expérience', 'Abbinamento con la tua esperienza', 'Relacionando tu experiencia', 'Relacionando sua experiência'],
  'Rewriting your CV for this role': ['Lebenslauf wird für die Stelle umgeschrieben', 'Réécriture du CV pour ce poste', 'Riscrittura del CV per il ruolo', 'Reescribiendo tu CV para el puesto', 'Reescrevendo o currículo para a vaga'],
  'Checking the wording': ['Formulierungen werden geprüft', 'Vérification de la formulation', 'Controllo della formulazione', 'Revisando la redacción', 'Revisando a redação'],
  'Reading your profile': ['Profil wird gelesen', 'Lecture de votre profil', 'Lettura del profilo', 'Leyendo tu perfil', 'Lendo seu perfil'],
  'Choosing what to highlight': ['Auswahl der Stärken', 'Choix des points forts', 'Scelta dei punti di forza', 'Eligiendo qué destacar', 'Escolhendo o que destacar'],
  'Writing your letter': ['Anschreiben wird geschrieben', 'Rédaction de la lettre', 'Scrittura della lettera', 'Escribiendo la carta', 'Escrevendo a carta'],
  'Polishing the wording': ['Feinschliff der Formulierungen', 'Peaufinage de la formulation', 'Rifinitura del testo', 'Puliendo la redacción', 'Refinando a redação'],
  'Reading your document': ['Dokument wird gelesen', 'Lecture du document', 'Lettura del documento', 'Leyendo tu documento', 'Lendo seu documento'],
  'Making the change': ['Änderung wird umgesetzt', 'Application de la modification', 'Applicazione della modifica', 'Aplicando el cambio', 'Aplicando a alteração'],
  'Stopped. Nothing was changed.': ['Abgebrochen. Nichts wurde geändert.', 'Arrêté. Rien n’a été modifié.', 'Interrotto. Nulla è stato modificato.', 'Detenido. No se cambió nada.', 'Interrompido. Nada foi alterado.'],
  'Cancel': ['Abbrechen', 'Annuler', 'Annulla', 'Cancelar', 'Cancelar'],
  'Progress': ['Fortschritt', 'Progression', 'Avanzamento', 'Progreso', 'Progresso'],
  'Vora AI chat': ['Vora KI Chat', 'Chat IA Vora', 'Chat IA Vora', 'Chat IA de Vora', 'Chat IA Vora'],
  'Ask Vora to change your CV…': ['Bitte Vora, deinen Lebenslauf zu ändern…', 'Demandez à Vora de modifier votre CV…', 'Chiedi a Vora di modificare il CV…', 'Pide a Vora que cambie tu CV…', 'Peça à Vora para mudar seu currículo…'],
  'Ask Vora to change your letter…': ['Bitte Vora, dein Anschreiben zu ändern…', 'Demandez à Vora de modifier votre lettre…', 'Chiedi a Vora di modificare la lettera…', 'Pide a Vora que cambie tu carta…', 'Peça à Vora para mudar sua carta…'],
  'Undo this change': ['Diese Änderung rückgängig machen', 'Annuler cette modification', 'Annulla questa modifica', 'Deshacer este cambio', 'Desfazer esta alteração'],
  'Undone': ['Rückgängig gemacht', 'Annulé', 'Annullato', 'Deshecho', 'Desfeito'],
  'Tell me in your own words. I change the page for you, and you can undo any change.': ['Sag es mir in deinen Worten. Ich ändere die Seite für dich, und du kannst jede Änderung rückgängig machen.', 'Dites-le avec vos mots. Je modifie la page pour vous, et vous pouvez annuler chaque changement.', 'Dimmelo con parole tue. Modifico la pagina per te e puoi annullare ogni modifica.', 'Dímelo con tus palabras. Cambio la página por ti y puedes deshacer cualquier cambio.', 'Diga com suas palavras. Eu mudo a página e você pode desfazer qualquer alteração.'],
  'Edits your CV': ['Bearbeitet deinen Lebenslauf', 'Modifie votre CV', 'Modifica il tuo CV', 'Edita tu CV', 'Edita seu currículo'],
  'Edits your cover letter': ['Bearbeitet dein Anschreiben', 'Modifie votre lettre', 'Modifica la tua lettera', 'Edita tu carta', 'Edita sua carta'],
  'Close chat': ['Chat schliessen', 'Fermer le chat', 'Chiudi chat', 'Cerrar chat', 'Fechar chat'],
  'Send': ['Senden', 'Envoyer', 'Invia', 'Enviar', 'Enviar'],
  'Make it fit on one page': ['Auf eine Seite kürzen', 'Le faire tenir sur une page', 'Fallo stare in una pagina', 'Que quepa en una página', 'Fazer caber em uma página'],
  'Write a profile summary from my experience': ['Schreibe ein Kurzprofil aus meiner Erfahrung', 'Rédige un résumé de profil à partir de mon expérience', 'Scrivi un profilo dalla mia esperienza', 'Escribe un resumen del perfil con mi experiencia', 'Escreva um resumo do perfil com minha experiência'],
  'Vora is editing': ['Vora bearbeitet', 'Vora modifie', 'Vora sta modificando', 'Vora está editando', 'A Vora está editando'],
  'Posted today': ['Heute veröffentlicht', 'Publiée aujourd’hui', 'Pubblicata oggi', 'Publicada hoy', 'Publicada hoje'],
  'Posted yesterday': ['Gestern veröffentlicht', 'Publiée hier', 'Pubblicata ieri', 'Publicada ayer', 'Publicada ontem'],
  'Posted 1 week ago': ['Vor 1 Woche veröffentlicht', 'Publiée il y a 1 semaine', 'Pubblicata 1 settimana fa', 'Publicada hace 1 semana', 'Publicada há 1 semana'],
  'Posting date not given': ['Veröffentlichungsdatum nicht angegeben', 'Date de publication non indiquée', 'Data di pubblicazione non indicata', 'Fecha de publicación no indicada', 'Data de publicação não informada'],
  'just now': ['gerade eben', "à l'instant", 'adesso', 'ahora mismo', 'agora mesmo'],
  '← Back': ['← Zurück', '← Retour', '← Indietro', '← Volver', '← Voltar'],
  'Back to search': ['Zurück zur Suche', 'Retour à la recherche', 'Torna alla ricerca', 'Volver a la búsqueda', 'Voltar à busca'],
  'Website': ['Website', 'Site web', 'Sito web', 'Sitio web', 'Site'],
  'Website ↗': ['Website ↗', 'Site web ↗', 'Sito web ↗', 'Sitio web ↗', 'Site ↗'],
  'Email': ['E-Mail', 'E-mail', 'E-mail', 'Correo', 'E-mail'],
  'Phone': ['Telefon', 'Téléphone', 'Telefono', 'Teléfono', 'Telefone'],
  'Location': ['Ort', 'Lieu', 'Luogo', 'Ubicación', 'Local'],
  'Company': ['Firma', 'Entreprise', 'Azienda', 'Empresa', 'Empresa'],
  'Job title': ['Jobtitel', 'Intitulé du poste', 'Ruolo', 'Puesto', 'Cargo'],
  'Status': ['Status', 'Statut', 'Stato', 'Estado', 'Status'],
  'Notes': ['Notizien', 'Notes', 'Note', 'Notas', 'Anotações'],
  'History': ['Verlauf', 'Historique', 'Cronologia', 'Historial', 'Histórico'],
  'CV': ['Lebenslauf', 'CV', 'CV', 'CV', 'Currículo'],
  'Skills': ['Fähigkeiten', 'Compétences', 'Competenze', 'Habilidades', 'Habilidades'],
  'Languages': ['Sprachen', 'Langues', 'Lingue', 'Idiomas', 'Idiomas'],
  'Links': ['Links', 'Liens', 'Link', 'Enlaces', 'Links'],
  'Filter': ['Filtern', 'Filtrer', 'Filtra', 'Filtrar', 'Filtrar'],
  'Demo': ['Demo', 'Démo', 'Demo', 'Demo', 'Demo'],
  'Web': ['Web', 'Web', 'Web', 'Web', 'Web'],

  // Tracker statuses
  'Applied': ['Beworben', 'Postulé', 'Candidato', 'Enviada', 'Enviada'],
  'Interview': ['Interview', 'Entretien', 'Colloquio', 'Entrevista', 'Entrevista'],
  'Offer': ['Angebot', 'Offre', 'Offerta', 'Oferta', 'Oferta'],
  'Rejected': ['Absage', 'Refusé', 'Rifiutato', 'Rechazada', 'Recusada'],

  // Home
  'Find your next job': ['Finde deinen nächsten Job', 'Trouvez votre prochain emploi', 'Trova il tuo prossimo lavoro', 'Encuentra tu próximo empleo', 'Encontre seu próximo emprego'],
  'One search covers the job portals near you. Claude ranks every role against your CV, then helps you tailor your application and practise the interview.': [
    'Eine Suche deckt die Jobportale in deiner Nähe ab. Claude vergleicht jede Stelle mit deinem Lebenslauf und hilft dir dann, deine Bewerbung anzupassen und das Interview zu üben.',
    'Une seule recherche couvre les sites d’emploi près de chez vous. Claude compare chaque poste à votre CV, puis vous aide à adapter votre candidature et à préparer l’entretien.',
    'Una sola ricerca copre i portali di lavoro vicino a te. Claude confronta ogni posizione con il tuo CV, poi ti aiuta ad adattare la candidatura e a prepararti al colloquio.',
    'Una sola búsqueda cubre los portales de empleo cerca de ti. Claude compara cada puesto con tu CV y luego te ayuda a adaptar tu candidatura y a preparar la entrevista.',
    'Uma busca cobre os portais de vagas perto de você. O Claude compara cada vaga com seu currículo e depois ajuda a adaptar sua candidatura e treinar a entrevista.',
  ],
  'Job title, skill or company': ['Jobtitel, Fähigkeit oder Firma', 'Poste, compétence ou entreprise', 'Ruolo, competenza o azienda', 'Puesto, habilidad o empresa', 'Cargo, habilidade ou empresa'],
  'City, region or "remote"': ['Stadt, Region oder «remote»', 'Ville, région ou « télétravail »', 'Città, regione o «remoto»', 'Ciudad, región o «remoto»', 'Cidade, região ou "remoto"'],
  'What': ['Was', 'Quoi', 'Cosa', 'Qué', 'O quê'],
  'Where': ['Wo', 'Où', 'Dove', 'Dónde', 'Onde'],
  'what / where': ['was / wo', 'quoi / où', 'cosa / dove', 'qué / dónde', 'o quê / onde'],
  'Jobs for you': ['Jobs für dich', 'Offres pour vous', 'Offerte per te', 'Empleos para ti', 'Vagas para você'],
  'Jobs for you (remote)': ['Jobs für dich (remote)', 'Offres pour vous (télétravail)', 'Offerte per te (da remoto)', 'Empleos para ti (remoto)', 'Vagas para você (remoto)'],
  'Upload your CV and we will find jobs near you that fit your experience.': [
    'Lade deinen Lebenslauf hoch und wir finden Jobs in deiner Nähe, die zu deiner Erfahrung passen.',
    'Importez votre CV et nous trouverons des offres près de chez vous qui correspondent à votre expérience.',
    'Carica il tuo CV e troveremo offerte vicino a te adatte alla tua esperienza.',
    'Sube tu CV y encontraremos empleos cerca de ti que encajen con tu experiencia.',
    'Envie seu currículo e encontraremos vagas perto de você que combinam com sua experiência.',
  ],
  'Upload your CV': ['Lebenslauf hochladen', 'Importer votre CV', 'Carica il tuo CV', 'Sube tu CV', 'Enviar currículo'],
  'Add your city in your profile to see jobs near you.': ['Gib in deinem Profil deine Stadt an, um Jobs in deiner Nähe zu sehen.', 'Ajoutez votre ville dans votre profil pour voir les offres près de chez vous.', 'Aggiungi la tua città nel profilo per vedere le offerte vicino a te.', 'Añade tu ciudad en tu perfil para ver empleos cerca de ti.', 'Adicione sua cidade no perfil para ver vagas perto de você.'],
  'Add your location': ['Ort hinzufügen', 'Ajouter votre lieu', 'Aggiungi la tua città', 'Añade tu ubicación', 'Adicionar sua cidade'],
  'No open roles matched this time.': ['Diesmal hat keine offene Stelle gepasst.', 'Aucun poste ne correspondait cette fois.', 'Questa volta nessuna posizione corrispondeva.', 'Esta vez no coincidió ningún puesto.', 'Desta vez nenhuma vaga combinou.'],
  'Try again later, or search with other keywords.': ['Versuche es später noch einmal oder suche mit anderen Stichworten.', 'Réessayez plus tard ou cherchez avec d’autres mots-clés.', 'Riprova più tardi o cerca con altre parole chiave.', 'Inténtalo más tarde o busca con otras palabras clave.', 'Tente mais tarde ou busque com outras palavras-chave.'],
  'Matched on this device by job title, skills, location and experience. No AI is used for these picks.': [
    'Auf diesem Gerät nach Jobtitel, Fähigkeiten, Ort und Erfahrung abgeglichen. Für diese Auswahl wird keine KI verwendet.',
    'Sélection faite sur cet appareil selon le poste, les compétences, le lieu et l’expérience. Aucune IA n’est utilisée pour ces choix.',
    'Abbinate su questo dispositivo per ruolo, competenze, luogo ed esperienza. Per questa selezione non si usa l’IA.',
    'Seleccionados en este dispositivo por puesto, habilidades, ubicación y experiencia. No se usa IA para esta selección.',
    'Selecionadas neste dispositivo por cargo, habilidades, local e experiência. Nenhuma IA é usada nesta seleção.',
  ],
  'Saved to your tracker': ['In deinen Bewerbungen gespeichert', 'Ajouté à vos candidatures', 'Salvato nelle tue candidature', 'Guardado en tus candidaturas', 'Salvo nas suas candidaturas'],
  'Saved to your applications': ['In deinen Bewerbungen gespeichert', 'Ajouté à vos candidatures', 'Salvato nelle tue candidature', 'Guardado en tus candidaturas', 'Salvo nas suas candidaturas'],
  'Save a job you like': ['Speichere einen Job, der dir gefällt', 'Enregistrez une offre qui vous plaît', 'Salva un’offerta che ti piace', 'Guarda un empleo que te guste', 'Salve uma vaga de que goste'],
  'Create a tailored CV for it': ['Erstelle einen passenden Lebenslauf dafür', 'Créez un CV adapté', 'Crea un CV su misura', 'Crea un CV adaptado', 'Crie um currículo sob medida'],
  'Apply and move it to Applied': ['Bewirb dich und verschiebe ihn zu «Beworben»', 'Postulez et passez-la en « Postulé »', 'Candidati e spostala in «Candidato»', 'Postúlate y muévelo a «Enviada»', 'Candidate-se e mova para "Enviada"'],
  'Play an interview game': ['Spiele ein Interview-Spiel', 'Jouez au jeu d’entretien', 'Gioca al gioco del colloquio', 'Juega al juego de entrevista', 'Jogue o jogo de entrevista'],
  'Your applications': ['Deine Bewerbungen', 'Vos candidatures', 'Le tue candidature', 'Tus candidaturas', 'Suas candidaturas'],
  'Open tracker': ['Übersicht öffnen', 'Ouvrir le suivi', 'Apri il riepilogo', 'Abrir seguimiento', 'Abrir acompanhamento'],
  'Profile strength': ['Profilstärke', 'Force du profil', 'Completezza del profilo', 'Fuerza del perfil', 'Força do perfil'],
  'Next: ': ['Als Nächstes: ', 'Ensuite : ', 'Prossimo passo: ', 'Siguiente: ', 'Próximo: '],
  'Next:': ['Als Nächstes:', 'Ensuite :', 'Prossimo passo:', 'Siguiente:', 'Próximo:'],
  'Complete. Claude has everything it needs to match you.': ['Vollständig. Claude hat alles, um dich passend zuzuordnen.', 'Complet. Claude a tout ce qu’il faut pour vous trouver des offres.', 'Completo. Claude ha tutto ciò che serve per abbinarti.', 'Completo. Claude tiene todo lo que necesita.', 'Completo. O Claude tem tudo de que precisa.'],
  'Next steps': ['Nächste Schritte', 'Prochaines étapes', 'Prossimi passi', 'Próximos pasos', 'Próximos passos'],

  // Notices
  'AI features need permission.': ['KI-Funktionen brauchen eine Erlaubnis.', 'Les fonctions IA ont besoin d’une autorisation.', 'Le funzioni IA richiedono un’autorizzazione.', 'Las funciones de IA necesitan permiso.', 'Os recursos de IA precisam de permissão.'],
  'Allow this page to use Claude when asked, or add an Anthropic API key in': ['Erlaube dieser Seite Claude zu nutzen, wenn gefragt wird, oder füge einen Anthropic-API-Schlüssel hinzu in', 'Autorisez cette page à utiliser Claude quand on vous le demande, ou ajoutez une clé API Anthropic dans', 'Consenti a questa pagina di usare Claude quando richiesto, oppure aggiungi una chiave API Anthropic in', 'Permite que esta página use Claude cuando se te pida, o añade una clave API de Anthropic en', 'Permita que esta página use o Claude quando solicitado, ou adicione uma chave de API da Anthropic em'],
  'AI features are off.': ['KI-Funktionen sind aus.', 'Les fonctions IA sont désactivées.', 'Le funzioni IA sono disattivate.', 'Las funciones de IA están desactivadas.', 'Os recursos de IA estão desligados.'],
  'Add your Anthropic API key in': ['Füge deinen Anthropic-API-Schlüssel hinzu in', 'Ajoutez votre clé API Anthropic dans', 'Aggiungi la tua chiave API Anthropic in', 'Añade tu clave API de Anthropic en', 'Adicione sua chave de API da Anthropic em'],
  'to tailor CVs, write cover letters, score matches and prep interviews.': ['um Lebensläufe anzupassen, Anschreiben zu schreiben, Treffer zu bewerten und Interviews vorzubereiten.', 'pour adapter vos CV, écrire des lettres, évaluer les offres et préparer les entretiens.', 'per adattare i CV, scrivere lettere, valutare le offerte e preparare i colloqui.', 'para adaptar CV, escribir cartas, puntuar ofertas y preparar entrevistas.', 'para adaptar currículos, escrever cartas, avaliar vagas e preparar entrevistas.'],
  'Add your CV first.': ['Füge zuerst deinen Lebenslauf hinzu.', 'Ajoutez d’abord votre CV.', 'Prima aggiungi il tuo CV.', 'Primero añade tu CV.', 'Primeiro adicione seu currículo.'],
  'Paste it into your': ['Füge ihn ein in dein', 'Collez-le dans votre', 'Incollalo nel tuo', 'Pégalo en tu', 'Cole-o no seu'],
  'so the AI can match and tailor it.': ['damit die KI ihn abgleichen und anpassen kann.', 'pour que l’IA puisse le comparer et l’adapter.', 'così l’IA può abbinarlo e adattarlo.', 'para que la IA pueda compararlo y adaptarlo.', 'para que a IA possa comparar e adaptar.'],
  'Add your API key in Settings first.': ['Füge zuerst deinen API-Schlüssel in den Einstellungen hinzu.', 'Ajoutez d’abord votre clé API dans les paramètres.', 'Prima aggiungi la tua chiave API nelle impostazioni.', 'Primero añade tu clave API en Ajustes.', 'Primeiro adicione sua chave de API nas configurações.'],

  // Find
  'Filter by job site': ['Nach Jobportal filtern', 'Filtrer par site', 'Filtra per sito', 'Filtrar por portal', 'Filtrar por site'],
  'Job details': ['Jobdetails', 'Détails du poste', 'Dettagli dell’offerta', 'Detalles del empleo', 'Detalhes da vaga'],
  'Remote only': ['Nur remote', 'Télétravail uniquement', 'Solo da remoto', 'Solo remoto', 'Só remoto'],
  'Rank by my CV': ['Nach meinem Lebenslauf ordnen', 'Classer selon mon CV', 'Ordina in base al mio CV', 'Ordenar según mi CV', 'Ordenar pelo meu currículo'],
  'Add your CV in Profile so matches can be ranked.': ['Füge deinen Lebenslauf im Profil hinzu, damit Treffer geordnet werden können.', 'Ajoutez votre CV dans le profil pour classer les offres.', 'Aggiungi il CV nel profilo per ordinare le offerte.', 'Añade tu CV en el perfil para ordenar las ofertas.', 'Adicione seu currículo no perfil para ordenar as vagas.'],
  'Search first, then rank the results.': ['Zuerst suchen, dann die Ergebnisse ordnen.', 'Lancez d’abord une recherche, puis classez les résultats.', 'Prima cerca, poi ordina i risultati.', 'Primero busca y luego ordena los resultados.', 'Busque primeiro e depois ordene os resultados.'],
  'Ranking each job against your CV…': ['Jeder Job wird mit deinem Lebenslauf verglichen…', 'Comparaison de chaque offre avec votre CV…', 'Confronto di ogni offerta con il tuo CV…', 'Comparando cada empleo con tu CV…', 'Comparando cada vaga com seu currículo…'],
  'Recent': ['Zuletzt', 'Récent', 'Recenti', 'Reciente', 'Recente'],
  'Your roles': ['Deine Stellen', 'Vos postes', 'I tuoi ruoli', 'Tus puestos', 'Seus cargos'],
  'Skill': ['Fähigkeit', 'Compétence', 'Competenza', 'Habilidad', 'Habilidade'],
  'Your location': ['Dein Ort', 'Votre lieu', 'La tua città', 'Tu ubicación', 'Sua cidade'],
  'Search above, or add your CV and city in your profile to see jobs picked for you here.': ['Suche oben oder füge im Profil Lebenslauf und Stadt hinzu, um hier passende Jobs zu sehen.', 'Lancez une recherche ou ajoutez votre CV et votre ville dans le profil pour voir ici des offres pour vous.', 'Cerca qui sopra o aggiungi CV e città nel profilo per vedere qui offerte per te.', 'Busca arriba o añade tu CV y tu ciudad en el perfil para ver aquí empleos para ti.', 'Busque acima ou adicione currículo e cidade no perfil para ver vagas para você aqui.'],
  'Open profile': ['Profil öffnen', 'Ouvrir le profil', 'Apri il profilo', 'Abrir perfil', 'Abrir perfil'],
  'No other matching jobs found right now. Search above to look for something else.': ['Gerade keine weiteren passenden Jobs gefunden. Suche oben nach etwas anderem.', 'Aucune autre offre trouvée pour le moment. Lancez une autre recherche ci-dessus.', 'Nessun’altra offerta trovata ora. Cerca qualcos’altro qui sopra.', 'No hay más empleos ahora. Busca otra cosa arriba.', 'Nenhuma outra vaga agora. Busque outra coisa acima.'],
  'Vora is the AI that searches, matches, writes and coaches for you. Choose which model powers it. Every task runs with the same senior HR recruiter instructions.': ['Vora ist die KI, die für dich sucht, abgleicht, schreibt und coacht. Wähle, welches Modell sie antreibt. Jede Aufgabe läuft mit denselben Anweisungen eines erfahrenen HR-Recruiters.', 'Vora est l’IA qui cherche, compare, rédige et vous coache. Choisissez le modèle qui la fait tourner. Chaque tâche suit les mêmes consignes de recruteur RH senior.', 'Vora è l’IA che cerca, abbina, scrive e ti fa da coach. Scegli quale modello la alimenta. Ogni attività segue le stesse istruzioni da recruiter HR senior.', 'Vora es la IA que busca, compara, redacta y te asesora. Elige qué modelo la impulsa. Cada tarea sigue las mismas instrucciones de un reclutador senior de RR. HH.', 'Vora é a IA que busca, compara, escreve e orienta você. Escolha qual modelo a alimenta. Cada tarefa segue as mesmas instruções de um recrutador sênior de RH.'],
  'Vora AI': ['Vora KI', 'IA Vora', 'IA Vora', 'IA de Vora', 'IA Vora'],
  'AI provider': ['KI-Anbieter', 'Fournisseur d’IA', 'Fornitore IA', 'Proveedor de IA', 'Provedor de IA'],
  'Save and test connection': ['Speichern und Verbindung testen', 'Enregistrer et tester', 'Salva e prova la connessione', 'Guardar y probar conexión', 'Salvar e testar conexão'],
  'Fast model': ['Schnelles Modell', 'Modèle rapide', 'Modello veloce', 'Modelo rápido', 'Modelo rápido'],
  'Change profile photo': ['Profilbild ändern', 'Changer la photo de profil', 'Cambia foto profilo', 'Cambiar foto de perfil', 'Alterar foto de perfil'],
  'Add profile photo': ['Profilbild hinzufügen', 'Ajouter une photo de profil', 'Aggiungi foto profilo', 'Añadir foto de perfil', 'Adicionar foto de perfil'],
  'Remove photo': ['Foto entfernen', 'Supprimer la photo', 'Rimuovi foto', 'Quitar foto', 'Remover foto'],
  'Tap to add a photo': ['Tippen, um ein Foto hinzuzufügen', 'Touchez pour ajouter une photo', 'Tocca per aggiungere una foto', 'Toca para añadir una foto', 'Toque para adicionar uma foto'],
  'Profile photo updated': ['Profilbild aktualisiert', 'Photo de profil mise à jour', 'Foto profilo aggiornata', 'Foto de perfil actualizada', 'Foto de perfil atualizada'],
  'Profile photo removed': ['Profilbild entfernt', 'Photo de profil supprimée', 'Foto profilo rimossa', 'Foto de perfil eliminada', 'Foto de perfil removida'],
  'Show less': ['Weniger anzeigen', 'Afficher moins', 'Mostra meno', 'Mostrar menos', 'Mostrar menos'],
  'See every listing on each job site': ['Alle Inserate auf jedem Jobportal ansehen', 'Voir toutes les annonces sur chaque site', 'Vedi tutti gli annunci su ogni sito', 'Ver todos los anuncios en cada portal', 'Ver todos os anúncios em cada site'],
  'Free job boards': ['Kostenlose Jobbörsen', 'Sites d’emploi gratuits', 'Bacheche di lavoro gratuite', 'Portales gratuitos', 'Sites de vagas gratuitos'],
  'Search on other job sites': ['Auf anderen Jobportalen suchen', 'Chercher sur d’autres sites', 'Cerca su altri siti', 'Buscar en otros portales', 'Buscar em outros sites'],
  "Opens each site's own results for this search.": ['Öffnet die Ergebnisse jedes Portals für diese Suche.', 'Ouvre les résultats de chaque site pour cette recherche.', 'Apre i risultati di ogni sito per questa ricerca.', 'Abre los resultados de cada portal para esta búsqueda.', 'Abre os resultados de cada site para esta busca.'],
  'Allow this page to use Claude to search job sites.': ['Erlaube dieser Seite, Claude für die Suche auf Jobportalen zu nutzen.', 'Autorisez cette page à utiliser Claude pour chercher sur les sites d’emploi.', 'Consenti a questa pagina di usare Claude per cercare sui siti di lavoro.', 'Permite que esta página use Claude para buscar en portales de empleo.', 'Permita que esta página use o Claude para buscar nos sites de vagas.'],
  'Searching job sites…': ['Jobportale werden durchsucht…', 'Recherche sur les sites d’emploi…', 'Ricerca sui siti di lavoro…', 'Buscando en portales de empleo…', 'Buscando nos sites de vagas…'],
  'No open postings found for this search': ['Keine offenen Stellen für diese Suche gefunden', 'Aucune offre trouvée pour cette recherche', 'Nessuna offerta trovata per questa ricerca', 'No se encontraron ofertas para esta búsqueda', 'Nenhuma vaga encontrada para esta busca'],
  'Searching free job boards…': ['Kostenlose Jobbörsen werden durchsucht…', 'Recherche sur les sites gratuits…', 'Ricerca sulle bacheche gratuite…', 'Buscando en portales gratuitos…', 'Buscando nos sites gratuitos…'],
  'Example listings. Search to see live openings near you.': ['Beispielinserate. Suche, um aktuelle Stellen in deiner Nähe zu sehen.', 'Exemples d’annonces. Lancez une recherche pour voir les offres près de chez vous.', 'Annunci di esempio. Cerca per vedere le offerte vicino a te.', 'Anuncios de ejemplo. Busca para ver ofertas reales cerca de ti.', 'Anúncios de exemplo. Busque para ver vagas reais perto de você.'],
  'All sites': ['Alle Portale', 'Tous les sites', 'Tutti i siti', 'Todos los portales', 'Todos os sites'],
  'No jobs to show. Try broader keywords, or open one of the job sites below.': ['Keine Jobs gefunden. Versuche allgemeinere Stichworte oder öffne eines der Portale unten.', 'Aucune offre. Essayez des mots-clés plus larges ou ouvrez un des sites ci-dessous.', 'Nessuna offerta. Prova parole chiave più generali o apri uno dei siti qui sotto.', 'No hay empleos. Prueba palabras más generales o abre uno de los portales de abajo.', 'Nenhuma vaga. Tente palavras mais gerais ou abra um dos sites abaixo.'],
  'Pick a job to see the details here.': ['Wähle einen Job, um hier die Details zu sehen.', 'Choisissez une offre pour voir les détails ici.', 'Scegli un’offerta per vedere qui i dettagli.', 'Elige un empleo para ver aquí los detalles.', 'Escolha uma vaga para ver os detalhes aqui.'],
  'Tailor my CV': ['Lebenslauf anpassen', 'Adapter mon CV', 'Adatta il mio CV', 'Adaptar mi CV', 'Adaptar meu currículo'],
  'Practise interview': ['Interview üben', 'S’entraîner à l’entretien', 'Allena il colloquio', 'Practicar entrevista', 'Treinar entrevista'],
  'View posting ↗': ['Inserat ansehen ↗', 'Voir l’annonce ↗', 'Vedi annuncio ↗', 'Ver anuncio ↗', 'Ver anúncio ↗'],
  'Ranked against your CV.': ['Mit deinem Lebenslauf verglichen.', 'Classé selon votre CV.', 'Ordinato in base al tuo CV.', 'Ordenado según tu CV.', 'Ordenado pelo seu currículo.'],
  'About the role': ['Über die Stelle', 'À propos du poste', 'Il ruolo', 'Sobre el puesto', 'Sobre a vaga'],
  'No description provided. Open the posting for the full details.': ['Keine Beschreibung vorhanden. Öffne das Inserat für alle Details.', 'Pas de description. Ouvrez l’annonce pour tous les détails.', 'Nessuna descrizione. Apri l’annuncio per tutti i dettagli.', 'Sin descripción. Abre el anuncio para ver todos los detalles.', 'Sem descrição. Abra o anúncio para ver todos os detalhes.'],
  'Add an API key in': ['Füge einen API-Schlüssel hinzu in', 'Ajoutez une clé API dans', 'Aggiungi una chiave API in', 'Añade una clave API en', 'Adicione uma chave de API em'],
  'to search every job site at once. Until then, use the free job boards or the site links below.': ['um alle Jobportale auf einmal zu durchsuchen. Bis dahin nutze die kostenlosen Jobbörsen oder die Links unten.', 'pour chercher sur tous les sites à la fois. En attendant, utilisez les sites gratuits ou les liens ci-dessous.', 'per cercare su tutti i siti insieme. Nel frattempo usa le bacheche gratuite o i link qui sotto.', 'para buscar en todos los portales a la vez. Mientras tanto, usa los portales gratuitos o los enlaces de abajo.', 'para buscar em todos os sites de uma vez. Até lá, use os sites gratuitos ou os links abaixo.'],

  // Add job
  'e.g. Senior Product Designer': ['z. B. Senior Product Designer', 'ex. Product Designer senior', 'es. Senior Product Designer', 'p. ej. Diseñador de producto sénior', 'ex.: Designer de produto sênior'],
  'e.g. Acme Inc.': ['z. B. Muster AG', 'ex. Exemple SA', 'es. Esempio SA', 'p. ej. Ejemplo S.A.', 'ex.: Exemplo Ltda.'],
  'e.g. Remote / Paris': ['z. B. Remote / Zürich', 'ex. Télétravail / Genève', 'es. Da remoto / Lugano', 'p. ej. Remoto / Madrid', 'ex.: Remoto / São Paulo'],
  'Paste the full job description here': ['Füge hier die ganze Stellenbeschreibung ein', 'Collez ici la description complète du poste', 'Incolla qui la descrizione completa', 'Pega aquí la descripción completa', 'Cole aqui a descrição completa da vaga'],
  'Link to posting': ['Link zum Inserat', 'Lien vers l’annonce', 'Link all’annuncio', 'Enlace al anuncio', 'Link do anúncio'],
  'Job description': ['Stellenbeschreibung', 'Description du poste', 'Descrizione del lavoro', 'Descripción del puesto', 'Descrição da vaga'],
  'Save job': ['Job speichern', 'Enregistrer l’offre', 'Salva offerta', 'Guardar empleo', 'Salvar vaga'],
  'Added by you': ['Von dir hinzugefügt', 'Ajouté par vous', 'Aggiunto da te', 'Añadido por ti', 'Adicionado por você'],
  'Job saved': ['Job gespeichert', 'Offre enregistrée', 'Offerta salvata', 'Empleo guardado', 'Vaga salva'],
  'Add a job': ['Job hinzufügen', 'Ajouter une offre', 'Aggiungi un’offerta', 'Añadir empleo', 'Adicionar vaga'],
  'Found something on LinkedIn, Indeed or a company site? Paste it here to tailor and track it.': ['Etwas auf LinkedIn, Indeed oder einer Firmenseite gefunden? Füge es hier ein, um es anzupassen und zu verfolgen.', 'Vous avez trouvé une offre sur LinkedIn, Indeed ou un site d’entreprise ? Collez-la ici pour l’adapter et la suivre.', 'Hai trovato qualcosa su LinkedIn, Indeed o un sito aziendale? Incollalo qui per adattarlo e seguirlo.', '¿Encontraste algo en LinkedIn, Indeed o la web de una empresa? Pégalo aquí para adaptarlo y seguirlo.', 'Achou algo no LinkedIn, Indeed ou site de empresa? Cole aqui para adaptar e acompanhar.'],

  // Tracker
  'Filter by title or company': ['Nach Titel oder Firma filtern', 'Filtrer par poste ou entreprise', 'Filtra per ruolo o azienda', 'Filtrar por puesto o empresa', 'Filtrar por cargo ou empresa'],
  'Drop jobs here': ['Jobs hierher ziehen', 'Déposez les offres ici', 'Trascina qui le offerte', 'Suelta empleos aquí', 'Solte vagas aqui'],
  'Drag cards between columns, or use the dropdown on each card.': ['Ziehe Karten zwischen Spalten oder nutze das Menü auf jeder Karte.', 'Glissez les cartes entre les colonnes ou utilisez le menu de chaque carte.', 'Trascina le schede tra le colonne o usa il menu di ogni scheda.', 'Arrastra las tarjetas entre columnas o usa el menú de cada tarjeta.', 'Arraste os cartões entre colunas ou use o menu de cada cartão.'],
  '+ Add job': ['+ Job hinzufügen', '+ Ajouter une offre', '+ Aggiungi offerta', '+ Añadir empleo', '+ Adicionar vaga'],

  // Job page
  'That job is no longer available.': ['Dieser Job ist nicht mehr verfügbar.', 'Cette offre n’est plus disponible.', 'Questa offerta non è più disponibile.', 'Este empleo ya no está disponible.', 'Esta vaga não está mais disponível.'],
  'Overview': ['Übersicht', 'Aperçu', 'Panoramica', 'Resumen', 'Visão geral'],
  'CV & cover letter': ['Lebenslauf & Anschreiben', 'CV & lettre', 'CV & lettera', 'CV y carta', 'Currículo e carta'],
  'Interview game': ['Interview-Spiel', 'Jeu d’entretien', 'Gioco del colloquio', 'Juego de entrevista', 'Jogo de entrevista'],
  'Contacts, salary notes, next steps…': ['Kontakte, Lohnnotizen, nächste Schritte…', 'Contacts, salaire, prochaines étapes…', 'Contatti, note sullo stipendio, prossimi passi…', 'Contactos, notas de salario, próximos pasos…', 'Contatos, salário, próximos passos…'],
  'Remove job': ['Job entfernen', 'Supprimer l’offre', 'Rimuovi offerta', 'Quitar empleo', 'Remover vaga'],
  'Tap again to remove': ['Zum Entfernen nochmals tippen', 'Touchez à nouveau pour supprimer', 'Tocca di nuovo per rimuovere', 'Toca otra vez para quitar', 'Toque de novo para remover'],
  'Job removed': ['Job entfernt', 'Offre supprimée', 'Offerta rimossa', 'Empleo quitado', 'Vaga removida'],
  'Save to tracker': ['In Bewerbungen speichern', 'Ajouter aux candidatures', 'Salva nelle candidature', 'Guardar en candidaturas', 'Salvar nas candidaturas'],
  'Save this job to track it and keep its documents.': ['Speichere diesen Job, um ihn zu verfolgen und seine Dokumente zu behalten.', 'Enregistrez cette offre pour la suivre et garder ses documents.', 'Salva questa offerta per seguirla e conservarne i documenti.', 'Guarda este empleo para seguirlo y conservar sus documentos.', 'Salve esta vaga para acompanhá-la e guardar os documentos.'],
  'Re-run fit analysis': ['Passung neu analysieren', 'Relancer l’analyse', 'Rifai l’analisi', 'Repetir el análisis', 'Refazer a análise'],
  'Analyse my fit': ['Meine Passung analysieren', 'Analyser mon adéquation', 'Analizza la mia idoneità', 'Analizar mi encaje', 'Analisar meu perfil'],
  'Fit analysis': ['Passungsanalyse', 'Analyse d’adéquation', 'Analisi di idoneità', 'Análisis de encaje', 'Análise de compatibilidade'],
  'No description provided.': ['Keine Beschreibung vorhanden.', 'Pas de description.', 'Nessuna descrizione.', 'Sin descripción.', 'Sem descrição.'],
  'Apply on company site ↗': ['Auf der Firmenseite bewerben ↗', 'Postuler sur le site ↗', 'Candidati sul sito ↗', 'Postular en la web ↗', 'Candidatar-se no site ↗'],

  // About the company
  'About the company': ['Über die Firma', 'À propos de l’entreprise', 'L’azienda', 'Sobre la empresa', 'Sobre a empresa'],
  'In their own words, from the posting': ['In eigenen Worten, aus dem Inserat', 'Avec leurs mots, tiré de l’annonce', 'Con le loro parole, dall’annuncio', 'Con sus palabras, del anuncio', 'Nas palavras deles, do anúncio'],
  'Industry': ['Branche', 'Secteur', 'Settore', 'Sector', 'Setor'],
  'Founded': ['Gegründet', 'Fondée', 'Fondata', 'Fundada', 'Fundada'],
  'Headquarters': ['Hauptsitz', 'Siège', 'Sede', 'Sede', 'Sede'],
  'Employees': ['Mitarbeitende', 'Employés', 'Dipendenti', 'Empleados', 'Funcionários'],
  'Ownership': ['Eigentum', 'Actionnariat', 'Proprietà', 'Propiedad', 'Controle'],
  'Employee rating': ['Bewertung Mitarbeitende', 'Note des employés', 'Valutazione dipendenti', 'Valoración de empleados', 'Avaliação dos funcionários'],
  'Working there': ['Arbeiten dort', 'Y travailler', 'Lavorarci', 'Trabajar allí', 'Trabalhar lá'],
  'Recent news': ['Aktuelle News', 'Actualités', 'Notizie recenti', 'Noticias recientes', 'Notícias recentes'],
  'Worth mentioning in your application': ['Lohnt sich in der Bewerbung zu erwähnen', 'À mentionner dans votre candidature', 'Da citare nella candidatura', 'Vale la pena mencionarlo en tu candidatura', 'Vale mencionar na sua candidatura'],
  'From a web search': ['Aus einer Websuche', 'D’une recherche web', 'Da una ricerca web', 'De una búsqueda web', 'De uma busca na web'],
  'Could not look up the company.': ['Die Firma konnte nicht nachgeschlagen werden.', 'Impossible de rechercher l’entreprise.', 'Impossibile cercare l’azienda.', 'No se pudo buscar la empresa.', 'Não foi possível pesquisar a empresa.'],
  'The posting does not name the company.': ['Das Inserat nennt die Firma nicht.', 'L’annonce ne nomme pas l’entreprise.', 'L’annuncio non indica l’azienda.', 'El anuncio no nombra la empresa.', 'O anúncio não cita a empresa.'],
  'This posting does not name the company.': ['Dieses Inserat nennt die Firma nicht.', 'Cette annonce ne nomme pas l’entreprise.', 'Questo annuncio non indica l’azienda.', 'Este anuncio no nombra la empresa.', 'Este anúncio não cita a empresa.'],
  'Allow web search and Claude for this page to see the full company profile.': ['Erlaube Websuche und Claude für diese Seite, um das ganze Firmenprofil zu sehen.', 'Autorisez la recherche web et Claude pour voir le profil complet de l’entreprise.', 'Consenti ricerca web e Claude per vedere il profilo completo dell’azienda.', 'Permite la búsqueda web y Claude para ver el perfil completo de la empresa.', 'Permita a busca na web e o Claude para ver o perfil completo da empresa.'],
  'Add an API key in Settings to see the full company profile.': ['Füge in den Einstellungen einen API-Schlüssel hinzu, um das ganze Firmenprofil zu sehen.', 'Ajoutez une clé API dans les paramètres pour voir le profil complet.', 'Aggiungi una chiave API nelle impostazioni per vedere il profilo completo.', 'Añade una clave API en Ajustes para ver el perfil completo.', 'Adicione uma chave de API nas configurações para ver o perfil completo.'],
  'Look up company': ['Firma nachschlagen', 'Rechercher l’entreprise', 'Cerca l’azienda', 'Buscar la empresa', 'Pesquisar empresa'],

  // Writing check
  'Writing check:': ['Schreibcheck:', 'Vérification du style :', 'Controllo stile:', 'Revisión de estilo:', 'Verificação de estilo:'],
  'no dashes or stock AI phrases found.': ['keine Gedankenstriche oder typischen KI-Floskeln gefunden.', 'aucun tiret ni formule typique d’IA trouvés.', 'nessun trattino o frase tipica da IA trovati.', 'no se encontraron guiones ni frases típicas de IA.', 'nenhum travessão ou frase típica de IA encontrados.'],
  'Fix wording': ['Formulierung verbessern', 'Corriger la formulation', 'Correggi la formulazione', 'Corregir redacción', 'Corrigir redação'],
  'Writing check': ['Schreibcheck', 'Vérification du style', 'Controllo stile', 'Revisión de estilo', 'Verificação de estilo'],

  // Document viewer
  'Actual size': ['Originalgrösse', 'Taille réelle', 'Dimensione reale', 'Tamaño real', 'Tamanho real'],
  'Fit to screen': ['An Bildschirm anpassen', 'Ajuster à l’écran', 'Adatta allo schermo', 'Ajustar a la pantalla', 'Ajustar à tela'],
  'Template': ['Vorlage', 'Modèle', 'Modello', 'Plantilla', 'Modelo'],
  'ATS friendly': ['ATS-freundlich', 'Compatible ATS', 'Compatibile ATS', 'Apto para ATS', 'Compatível com ATS'],
  'Less ATS friendly': ['Weniger ATS-freundlich', 'Moins compatible ATS', 'Meno compatibile ATS', 'Menos apto para ATS', 'Menos compatível com ATS'],
  'Colour': ['Farbe', 'Couleur', 'Colore', 'Color', 'Cor'],
  'Making PDF…': ['PDF wird erstellt…', 'Création du PDF…', 'Creazione PDF…', 'Creando PDF…', 'Gerando PDF…'],
  'Could not make the PDF. Check your connection and try again.': ['Das PDF konnte nicht erstellt werden. Prüfe deine Verbindung und versuche es erneut.', 'Impossible de créer le PDF. Vérifiez votre connexion et réessayez.', 'Impossibile creare il PDF. Controlla la connessione e riprova.', 'No se pudo crear el PDF. Revisa tu conexión e inténtalo de nuevo.', 'Não foi possível gerar o PDF. Verifique sua conexão e tente de novo.'],
  'Download PDF': ['PDF herunterladen', 'Télécharger le PDF', 'Scarica PDF', 'Descargar PDF', 'Baixar PDF'],
  'Copy as text': ['Als Text kopieren', 'Copier le texte', 'Copia come testo', 'Copiar como texto', 'Copiar como texto'],
  'Download text': ['Text herunterladen', 'Télécharger le texte', 'Scarica testo', 'Descargar texto', 'Baixar texto'],
  'Ask Claude for changes': ['Claude um Änderungen bitten', 'Demander des changements à Claude', 'Chiedi modifiche a Claude', 'Pedir cambios a Claude', 'Pedir mudanças ao Claude'],
  'Paste into application forms': ['In Bewerbungsformulare einfügen', 'Coller dans les formulaires', 'Incolla nei moduli di candidatura', 'Pegar en formularios', 'Colar em formulários'],
  'Say what you want changed first.': ['Sag zuerst, was geändert werden soll.', 'Dites d’abord ce que vous voulez changer.', 'Prima di’ cosa vuoi cambiare.', 'Primero di qué quieres cambiar.', 'Primeiro diga o que quer mudar.'],
  'Rewording those lines…': ['Diese Zeilen werden umformuliert…', 'Reformulation de ces lignes…', 'Riformulazione di quelle righe…', 'Reformulando esas líneas…', 'Reescrevendo essas linhas…'],
  'Ready to send': ['Bereit zum Senden', 'Prêt à envoyer', 'Pronto da inviare', 'Listo para enviar', 'Pronto para enviar'],
  'Rewrite from scratch': ['Neu schreiben', 'Réécrire entièrement', 'Riscrivi da zero', 'Reescribir desde cero', 'Reescrever do zero'],

  // CV
  'Tailored CV': ['Angepasster Lebenslauf', 'CV adapté', 'CV su misura', 'CV adaptado', 'Currículo adaptado'],
  'Create tailored CV': ['Angepassten Lebenslauf erstellen', 'Créer un CV adapté', 'Crea CV su misura', 'Crear CV adaptado', 'Criar currículo adaptado'],
  'Claude is rewriting your CV for this job. This takes about a minute.': ['Claude schreibt deinen Lebenslauf für diesen Job um. Das dauert etwa eine Minute.', 'Claude réécrit votre CV pour ce poste. Cela prend environ une minute.', 'Claude sta riscrivendo il tuo CV per questa offerta. Ci vuole circa un minuto.', 'Claude está reescribiendo tu CV para este empleo. Tarda alrededor de un minuto.', 'O Claude está reescrevendo seu currículo para esta vaga. Leva cerca de um minuto.'],
  'Open your CV': ['Lebenslauf öffnen', 'Ouvrir votre CV', 'Apri il tuo CV', 'Abrir tu CV', 'Abrir seu currículo'],
  'Open CV': ['Lebenslauf öffnen', 'Ouvrir le CV', 'Apri CV', 'Abrir CV', 'Abrir currículo'],
  'Your CV, rewritten for this job': ['Dein Lebenslauf, umgeschrieben für diesen Job', 'Votre CV, réécrit pour ce poste', 'Il tuo CV, riscritto per questa offerta', 'Tu CV, reescrito para este empleo', 'Seu currículo, reescrito para esta vaga'],
  "Claude reorders and rewrites your experience around what this role asks for, uses the posting's own keywords, and lays it out in a professional template you can download as a PDF. It never adds experience you don't have.": [
    'Claude ordnet und formuliert deine Erfahrung nach dem, was diese Stelle verlangt, nutzt die Stichworte aus dem Inserat und setzt alles in eine professionelle Vorlage, die du als PDF herunterladen kannst. Es fügt nie Erfahrung hinzu, die du nicht hast.',
    'Claude réorganise et réécrit votre expérience selon ce que demande le poste, reprend les mots-clés de l’annonce et la met en page dans un modèle professionnel à télécharger en PDF. Il n’ajoute jamais d’expérience que vous n’avez pas.',
    'Claude riordina e riscrive la tua esperienza in base a ciò che chiede il ruolo, usa le parole chiave dell’annuncio e la impagina in un modello professionale da scaricare in PDF. Non aggiunge mai esperienze che non hai.',
    'Claude reordena y reescribe tu experiencia según lo que pide el puesto, usa las palabras clave del anuncio y lo maqueta en una plantilla profesional que puedes descargar en PDF. Nunca añade experiencia que no tengas.',
    'O Claude reorganiza e reescreve sua experiência conforme o que a vaga pede, usa as palavras-chave do anúncio e monta tudo num modelo profissional para baixar em PDF. Nunca adiciona experiência que você não tem.',
  ],
  'Your CV': ['Dein Lebenslauf', 'Votre CV', 'Il tuo CV', 'Tu CV', 'Seu currículo'],
  'What changed': ['Was sich geändert hat', 'Changements', 'Cosa è cambiato', 'Qué cambió', 'O que mudou'],
  'What changed for this job': ['Was sich für diesen Job geändert hat', 'Ce qui a changé pour ce poste', 'Cosa è cambiato per questa offerta', 'Qué cambió para este empleo', 'O que mudou para esta vaga'],
  'No change notes for this version.': ['Keine Änderungsnotizen für diese Version.', 'Pas de notes pour cette version.', 'Nessuna nota per questa versione.', 'No hay notas para esta versión.', 'Sem notas para esta versão.'],
  'Keywords covered': ['Abgedeckte Stichworte', 'Mots-clés couverts', 'Parole chiave coperte', 'Palabras clave cubiertas', 'Palavras-chave cobertas'],
  'e.g. make it one page, stress leadership, drop the 2015 job': ['z. B. auf eine Seite kürzen, Führung betonen, den Job von 2015 weglassen', 'ex. une seule page, mettre en avant le management, retirer le poste de 2015', 'es. una sola pagina, evidenzia la leadership, togli il lavoro del 2015', 'p. ej. una sola página, destacar el liderazgo, quitar el empleo de 2015', 'ex.: uma página só, destacar liderança, tirar o emprego de 2015'],
  'Update CV': ['Lebenslauf aktualisieren', 'Mettre à jour le CV', 'Aggiorna CV', 'Actualizar CV', 'Atualizar currículo'],
  'Updating your CV…': ['Lebenslauf wird aktualisiert…', 'Mise à jour du CV…', 'Aggiornamento del CV…', 'Actualizando tu CV…', 'Atualizando seu currículo…'],

  // Editing on the page
  'Edit on page': ['Auf der Seite bearbeiten', 'Modifier sur la page', 'Modifica sulla pagina', 'Editar en la página', 'Editar na página'],
  'Done editing': ['Fertig', 'Terminé', 'Fatto', 'Listo', 'Concluir'],
  'Click any text to change it. Enter adds a bullet point. Everything saves as you type.': ['Klicke auf einen Text, um ihn zu ändern. Enter fügt einen Aufzählungspunkt hinzu. Alles wird beim Tippen gespeichert.', 'Cliquez sur un texte pour le modifier. Entrée ajoute une puce. Tout est enregistré pendant la saisie.', 'Clicca su un testo per cambiarlo. Invio aggiunge un punto elenco. Tutto si salva mentre scrivi.', 'Haz clic en cualquier texto para cambiarlo. Intro añade una viñeta. Todo se guarda mientras escribes.', 'Toque em qualquer texto para mudar. Enter adiciona um item. Tudo é salvo enquanto você digita.'],
  'Add job': ['Job hinzufügen', 'Ajouter un poste', 'Aggiungi lavoro', 'Añadir empleo', 'Adicionar emprego'],
  'Add education': ['Ausbildung hinzufügen', 'Ajouter une formation', 'Aggiungi formazione', 'Añadir formación', 'Adicionar formação'],
  'Add project': ['Projekt hinzufügen', 'Ajouter un projet', 'Aggiungi progetto', 'Añadir proyecto', 'Adicionar projeto'],
  'Add skill group': ['Fähigkeitsgruppe hinzufügen', 'Ajouter un groupe', 'Aggiungi gruppo', 'Añadir grupo', 'Adicionar grupo'],
  'Remove this job': ['Diesen Job entfernen', 'Retirer ce poste', 'Rimuovi questo lavoro', 'Quitar este empleo', 'Remover este emprego'],
  'Remove this entry': ['Diesen Eintrag entfernen', 'Retirer cette entrée', 'Rimuovi questa voce', 'Quitar esta entrada', 'Remover esta entrada'],
  'Remove this project': ['Dieses Projekt entfernen', 'Retirer ce projet', 'Rimuovi questo progetto', 'Quitar este proyecto', 'Remover este projeto'],
  'Remove this group': ['Diese Gruppe entfernen', 'Retirer ce groupe', 'Rimuovi questo gruppo', 'Quitar este grupo', 'Remover este grupo'],

  // Template descriptions
  'The classic résumé from Harvard career services. Serif, centred, no colour.': ['Der klassische Lebenslauf des Harvard Career Service. Serifenschrift, zentriert, ohne Farbe.', 'Le CV classique du service carrières de Harvard. Empattements, centré, sans couleur.', 'Il CV classico del career service di Harvard. Graziato, centrato, senza colore.', 'El currículum clásico del servicio de carreras de Harvard. Con serifa, centrado, sin color.', 'O currículo clássico do serviço de carreiras de Harvard. Com serifa, centralizado, sem cor.'],
  'The popular LaTeX résumé used across tech. Dense and tidy.': ['Der beliebte LaTeX-Lebenslauf aus der Tech-Welt. Kompakt und aufgeräumt.', 'Le CV LaTeX populaire dans la tech. Dense et soigné.', 'Il popolare CV LaTeX usato nel tech. Compatto e ordinato.', 'El popular currículum LaTeX del mundo tech. Denso y ordenado.', 'O popular currículo em LaTeX usado em tecnologia. Denso e organizado.'],
  'Clean sans serif with a colour accent.': ['Klare serifenlose Schrift mit Farbakzent.', 'Sans empattements, épuré, avec une touche de couleur.', 'Pulito, senza grazie, con un accento di colore.', 'Limpio, sin serifa, con un toque de color.', 'Limpo, sem serifa, com um toque de cor.'],
  'Lots of white space and quiet headings.': ['Viel Weissraum und ruhige Überschriften.', 'Beaucoup d’espace et des titres discrets.', 'Molto spazio bianco e titoli discreti.', 'Mucho espacio en blanco y títulos discretos.', 'Muito espaço em branco e títulos discretos.'],
  'The well-known LaTeX CV with a bold colour accent.': ['Der bekannte LaTeX-Lebenslauf mit kräftigem Farbakzent.', 'Le célèbre CV LaTeX avec une couleur affirmée.', 'Il noto CV LaTeX con un forte accento di colore.', 'El conocido CV en LaTeX con un color llamativo.', 'O conhecido currículo LaTeX com uma cor marcante.'],
  'LaTeX classic with dates in a left column.': ['LaTeX-Klassiker mit Daten in einer linken Spalte.', 'Classique LaTeX avec les dates dans une colonne à gauche.', 'Classico LaTeX con le date in una colonna a sinistra.', 'Clásico de LaTeX con las fechas en una columna a la izquierda.', 'Clássico do LaTeX com as datas numa coluna à esquerda.'],
  'The EU standard layout with labels on the left.': ['Das EU-Standardlayout mit Beschriftungen links.', 'La mise en page standard de l’UE, libellés à gauche.', 'Il layout standard dell’UE con etichette a sinistra.', 'El formato estándar de la UE con etiquetas a la izquierda.', 'O layout padrão da UE com rótulos à esquerda.'],
  'Coloured sidebar for contact and skills. Eye-catching, but some ATS read two columns poorly.': ['Farbige Seitenleiste für Kontakt und Fähigkeiten. Auffällig, aber manche ATS lesen zwei Spalten schlecht.', 'Barre latérale colorée pour le contact et les compétences. Accrocheur, mais certains ATS lisent mal deux colonnes.', 'Barra laterale colorata per contatti e competenze. D’effetto, ma alcuni ATS leggono male due colonne.', 'Barra lateral de color para contacto y habilidades. Llamativo, pero algunos ATS leen mal dos columnas.', 'Barra lateral colorida para contato e habilidades. Chama atenção, mas alguns ATS leem mal duas colunas.'],

  // Cover letter
  'Cover letter': ['Anschreiben', 'Lettre de motivation', 'Lettera di presentazione', 'Carta de presentación', 'Carta de apresentação'],
  'Tone': ['Ton', 'Ton', 'Tono', 'Tono', 'Tom'],
  'professional': ['professionell', 'professionnel', 'professionale', 'profesional', 'profissional'],
  'warm and enthusiastic': ['herzlich und begeistert', 'chaleureux et enthousiaste', 'caloroso ed entusiasta', 'cálido y entusiasta', 'caloroso e entusiasmado'],
  'concise and direct': ['kurz und direkt', 'concis et direct', 'conciso e diretto', 'conciso y directo', 'conciso e direto'],
  'formal': ['formell', 'formel', 'formale', 'formal', 'formal'],
  'Write cover letter': ['Anschreiben schreiben', 'Écrire la lettre', 'Scrivi la lettera', 'Escribir carta', 'Escrever carta'],
  'Claude is writing your letter…': ['Claude schreibt dein Anschreiben…', 'Claude écrit votre lettre…', 'Claude sta scrivendo la tua lettera…', 'Claude está escribiendo tu carta…', 'O Claude está escrevendo sua carta…'],
  'Write the letter first': ['Schreibe zuerst das Anschreiben', 'Écrivez d’abord la lettre', 'Prima scrivi la lettera', 'Primero escribe la carta', 'Primeiro escreva a carta'],
  'Open your cover letter': ['Anschreiben öffnen', 'Ouvrir votre lettre', 'Apri la tua lettera', 'Abrir tu carta', 'Abrir sua carta'],
  'Open letter': ['Anschreiben öffnen', 'Ouvrir la lettre', 'Apri lettera', 'Abrir carta', 'Abrir carta'],
  'A cover letter for this job': ['Ein Anschreiben für diesen Job', 'Une lettre pour ce poste', 'Una lettera per questa offerta', 'Una carta para este empleo', 'Uma carta para esta vaga'],
  'Claude writes a specific, human-sounding letter from your CV and lays it out as a proper business letter in the same template as your CV. You can switch templates and colours, edit it and download it as a PDF.': [
    'Claude schreibt aus deinem Lebenslauf ein konkretes, menschlich klingendes Anschreiben und setzt es als richtigen Geschäftsbrief in dieselbe Vorlage wie deinen Lebenslauf. Du kannst Vorlage und Farbe wechseln, es bearbeiten und als PDF herunterladen.',
    'Claude écrit à partir de votre CV une lettre précise et naturelle, mise en page comme une vraie lettre dans le même modèle que votre CV. Vous pouvez changer de modèle et de couleur, la modifier et la télécharger en PDF.',
    'Claude scrive dal tuo CV una lettera concreta e naturale, impaginata come una vera lettera nello stesso modello del CV. Puoi cambiare modello e colore, modificarla e scaricarla in PDF.',
    'Claude escribe a partir de tu CV una carta concreta y natural, maquetada como una carta formal en la misma plantilla que tu CV. Puedes cambiar plantilla y color, editarla y descargarla en PDF.',
    'O Claude escreve a partir do seu currículo uma carta específica e natural, formatada como carta formal no mesmo modelo do currículo. Você pode trocar modelo e cor, editar e baixar em PDF.',
  ],
  'Your cover letter': ['Dein Anschreiben', 'Votre lettre', 'La tua lettera', 'Tu carta', 'Sua carta'],
  'Matches the template of your CV for this job.': ['Passt zur Vorlage deines Lebenslaufs für diesen Job.', 'Reprend le modèle de votre CV pour ce poste.', 'Usa lo stesso modello del tuo CV per questa offerta.', 'Usa la misma plantilla que tu CV para este empleo.', 'Usa o mesmo modelo do seu currículo para esta vaga.'],
  'e.g. shorter, mention my team lead role, warmer ending': ['z. B. kürzer, meine Teamleitung erwähnen, wärmerer Schluss', 'ex. plus courte, mentionner mon rôle de chef d’équipe, fin plus chaleureuse', 'es. più breve, cita il mio ruolo di team lead, chiusura più calorosa', 'p. ej. más corta, menciona mi rol de jefe de equipo, cierre más cálido', 'ex.: mais curta, citar meu papel de líder de equipe, final mais caloroso'],
  'Update letter': ['Anschreiben aktualisieren', 'Mettre à jour la lettre', 'Aggiorna lettera', 'Actualizar carta', 'Atualizar carta'],
  'Updating your letter…': ['Anschreiben wird aktualisiert…', 'Mise à jour de la lettre…', 'Aggiornamento della lettera…', 'Actualizando tu carta…', 'Atualizando sua carta…'],
  'Letter text': ['Text des Anschreibens', 'Texte de la lettre', 'Testo della lettera', 'Texto de la carta', 'Texto da carta'],
  'Changes show on the page as you type. Leave an empty line between paragraphs.': ['Änderungen erscheinen beim Tippen auf der Seite. Lass zwischen Absätzen eine Leerzeile.', 'Les modifications apparaissent pendant la saisie. Laissez une ligne vide entre les paragraphes.', 'Le modifiche compaiono mentre scrivi. Lascia una riga vuota tra i paragrafi.', 'Los cambios aparecen mientras escribes. Deja una línea en blanco entre párrafos.', 'As mudanças aparecem enquanto você digita. Deixe uma linha em branco entre parágrafos.'],

  // Profile
  'All changes saved': ['Alle Änderungen gespeichert', 'Modifications enregistrées', 'Modifiche salvate', 'Cambios guardados', 'Alterações salvas'],
  'Saving…': ['Speichert…', 'Enregistrement…', 'Salvataggio…', 'Guardando…', 'Salvando…'],
  'Full name': ['Vollständiger Name', 'Nom complet', 'Nome e cognome', 'Nombre completo', 'Nome completo'],
  'Your name': ['Dein Name', 'Votre nom', 'Il tuo nome', 'Tu nombre', 'Seu nome'],
  'Headline': ['Kurzprofil', 'Titre', 'Titolo', 'Titular', 'Título'],
  'City, country': ['Stadt, Land', 'Ville, pays', 'Città, paese', 'Ciudad, país', 'Cidade, país'],
  'Edit your details': ['Deine Angaben bearbeiten', 'Modifier vos informations', 'Modifica i tuoi dati', 'Editar tus datos', 'Editar seus dados'],
  'Changes save as you type.': ['Änderungen werden beim Tippen gespeichert.', 'Les modifications sont enregistrées pendant la saisie.', 'Le modifiche si salvano mentre scrivi.', 'Los cambios se guardan mientras escribes.', 'As alterações são salvas enquanto você digita.'],
  'Add your name': ['Namen hinzufügen', 'Ajouter votre nom', 'Aggiungi il tuo nome', 'Añade tu nombre', 'Adicionar seu nome'],
  'Add a headline so employers and Claude know what you do.': ['Füge ein Kurzprofil hinzu, damit Arbeitgeber und Claude wissen, was du machst.', 'Ajoutez un titre pour que les employeurs et Claude sachent ce que vous faites.', 'Aggiungi un titolo così datori di lavoro e Claude sanno cosa fai.', 'Añade un titular para que las empresas y Claude sepan a qué te dedicas.', 'Adicione um título para que empresas e o Claude saibam o que você faz.'],
  'Add location': ['Ort hinzufügen', 'Ajouter le lieu', 'Aggiungi città', 'Añadir ubicación', 'Adicionar local'],
  'Add email': ['E-Mail hinzufügen', 'Ajouter l’e-mail', 'Aggiungi e-mail', 'Añadir correo', 'Adicionar e-mail'],
  'Add phone': ['Telefon hinzufügen', 'Ajouter le téléphone', 'Aggiungi telefono', 'Añadir teléfono', 'Adicionar telefone'],
  'Upload your CV above, or paste it here as plain text.': ['Lade deinen Lebenslauf oben hoch oder füge ihn hier als Text ein.', 'Importez votre CV ci-dessus ou collez-le ici en texte brut.', 'Carica il CV qui sopra o incollalo qui come testo.', 'Sube tu CV arriba o pégalo aquí como texto.', 'Envie seu currículo acima ou cole aqui como texto.'],
  'PDF, Word (.docx), text, or a photo of your CV. Read on this device.': ['PDF, Word (.docx), Text oder ein Foto deines Lebenslaufs. Wird auf diesem Gerät gelesen.', 'PDF, Word (.docx), texte ou photo de votre CV. Lu sur cet appareil.', 'PDF, Word (.docx), testo o foto del CV. Letto su questo dispositivo.', 'PDF, Word (.docx), texto o una foto de tu CV. Se lee en este dispositivo.', 'PDF, Word (.docx), texto ou foto do currículo. Lido neste dispositivo.'],
  'Upload a new version': ['Neue Version hochladen', 'Importer une nouvelle version', 'Carica una nuova versione', 'Subir una nueva versión', 'Enviar nova versão'],
  'Drag a file here or click to choose': ['Datei hierher ziehen oder klicken zum Auswählen', 'Glissez un fichier ici ou cliquez pour choisir', 'Trascina un file qui o clicca per sceglierlo', 'Arrastra un archivo aquí o haz clic para elegir', 'Arraste um arquivo aqui ou clique para escolher'],
  'That file is over 15 MB. Upload a smaller one.': ['Diese Datei ist grösser als 15 MB. Lade eine kleinere hoch.', 'Ce fichier dépasse 15 Mo. Importez-en un plus petit.', 'Il file supera 15 MB. Caricane uno più piccolo.', 'El archivo supera 15 MB. Sube uno más pequeño.', 'O arquivo tem mais de 15 MB. Envie um menor.'],
  'Add an API key in Settings so Claude can read it.': ['Füge in den Einstellungen einen API-Schlüssel hinzu, damit Claude ihn lesen kann.', 'Ajoutez une clé API dans les paramètres pour que Claude puisse le lire.', 'Aggiungi una chiave API nelle impostazioni così Claude può leggerlo.', 'Añade una clave API en Ajustes para que Claude pueda leerlo.', 'Adicione uma chave de API nas configurações para o Claude ler.'],
  'Could not read that file. Try a PDF or Word file.': ['Diese Datei konnte nicht gelesen werden. Versuche ein PDF oder Word.', 'Impossible de lire ce fichier. Essayez un PDF ou un Word.', 'Impossibile leggere il file. Prova un PDF o un Word.', 'No se pudo leer el archivo. Prueba con un PDF o Word.', 'Não foi possível ler o arquivo. Tente um PDF ou Word.'],
  'Review again': ['Erneut prüfen', 'Réévaluer', 'Rivaluta', 'Revisar de nuevo', 'Revisar de novo'],
  'Review my CV': ['Lebenslauf prüfen', 'Évaluer mon CV', 'Valuta il mio CV', 'Revisar mi CV', 'Revisar meu currículo'],
  'Upload or paste your CV first.': ['Lade deinen Lebenslauf zuerst hoch oder füge ihn ein.', 'Importez ou collez d’abord votre CV.', 'Prima carica o incolla il CV.', 'Primero sube o pega tu CV.', 'Primeiro envie ou cole seu currículo.'],
  'Claude is reading your CV…': ['Claude liest deinen Lebenslauf…', 'Claude lit votre CV…', 'Claude sta leggendo il tuo CV…', 'Claude está leyendo tu CV…', 'O Claude está lendo seu currículo…'],
  'Filled in your profile from the CV': ['Profil aus dem Lebenslauf ausgefüllt', 'Profil rempli à partir du CV', 'Profilo compilato dal CV', 'Perfil completado con el CV', 'Perfil preenchido a partir do currículo'],
  'CV review': ['Lebenslauf-Check', 'Évaluation du CV', 'Valutazione del CV', 'Revisión del CV', 'Avaliação do currículo'],
  'What works': ['Was gut ist', 'Ce qui fonctionne', 'Cosa funziona', 'Lo que funciona', 'O que funciona'],
  'What to fix first': ['Was zuerst verbessern', 'À corriger en premier', 'Cosa correggere prima', 'Qué corregir primero', 'O que corrigir primeiro'],
  'Screening software': ['Bewerbungssoftware (ATS)', 'Logiciels de tri (ATS)', 'Software di selezione (ATS)', 'Software de selección (ATS)', 'Software de triagem (ATS)'],
  'e.g. Data analyst who turns logistics data into decisions': ['z. B. Datenanalyst, der aus Logistikdaten Entscheidungen macht', 'ex. Analyste de données qui transforme la logistique en décisions', 'es. Data analyst che trasforma i dati logistici in decisioni', 'p. ej. Analista de datos que convierte datos logísticos en decisiones', 'ex.: Analista de dados que transforma dados logísticos em decisões'],
  'e.g. Full stack developer who ships fast, tested web apps': ['z. B. Full-Stack-Entwickler, der schnell getestete Web-Apps liefert', 'ex. Développeur full stack qui livre vite des apps web testées', 'es. Sviluppatore full stack che rilascia app web testate e veloci', 'p. ej. Desarrollador full stack que entrega apps web probadas y rápidas', 'ex.: Desenvolvedor full stack que entrega apps web testados e rápidos'],
  'Currency': ['Währung', 'Devise', 'Valuta', 'Moneda', 'Moeda'],
  'Per': ['Pro', 'Par', 'Per', 'Por', 'Por'],
  'per year': ['pro Jahr', 'par an', "all'anno", 'al año', 'por ano'],
  'per month': ['pro Monat', 'par mois', 'al mese', 'al mes', 'por mês'],
  'per hour': ['pro Stunde', 'de l’heure', "all'ora", 'por hora', 'por hora'],
  'Choose…': ['Auswählen…', 'Choisir…', 'Scegli…', 'Elegir…', 'Escolher…'],
  'Immediately': ['Sofort', 'Immédiatement', 'Subito', 'Inmediatamente', 'Imediatamente'],
  'Within 2 weeks': ['Innert 2 Wochen', 'Sous 2 semaines', 'Entro 2 settimane', 'En 2 semanas', 'Em até 2 semanas'],
  'Within 1 month': ['Innert 1 Monat', 'Sous 1 mois', 'Entro 1 mese', 'En 1 mes', 'Em até 1 mês'],
  'Within 2 months': ['Innert 2 Monaten', 'Sous 2 mois', 'Entro 2 mesi', 'En 2 meses', 'Em até 2 meses'],
  'In 3 months or more': ['In 3 Monaten oder später', 'Dans 3 mois ou plus', 'Tra 3 mesi o più', 'En 3 meses o más', 'Em 3 meses ou mais'],
  'e.g. EU citizen, or: need visa sponsorship for the UK': ['z. B. EU-Bürger, oder: brauche ein Visum für die Schweiz', 'ex. citoyen UE, ou : besoin d’un visa pour la Suisse', 'es. cittadino UE, oppure: serve un visto per la Svizzera', 'p. ej. ciudadano de la UE, o: necesito visado para Suiza', 'ex.: cidadão da UE, ou: preciso de visto para a Suíça'],
  'e.g. Data Analyst, then press Enter': ['z. B. Data Analyst, dann Enter drücken', 'ex. Analyste de données, puis Entrée', 'es. Data Analyst, poi premi Invio', 'p. ej. Analista de datos y pulsa Intro', 'ex.: Analista de dados e tecle Enter'],
  'e.g. SQL, then press Enter': ['z. B. SQL, dann Enter drücken', 'ex. SQL, puis Entrée', 'es. SQL, poi premi Invio', 'p. ej. SQL y pulsa Intro', 'ex.: SQL e tecle Enter'],
  'e.g. Dutch (native), then press Enter': ['z. B. Deutsch (Muttersprache), dann Enter drücken', 'ex. Français (langue maternelle), puis Entrée', 'es. Italiano (madrelingua), poi premi Invio', 'p. ej. Español (nativo) y pulsa Intro', 'ex.: Português (nativo) e tecle Enter'],
  'Add more': ['Mehr hinzufügen', 'Ajouter', 'Aggiungi altro', 'Añadir más', 'Adicionar mais'],
  'CV added': ['Lebenslauf hinzugefügt', 'CV ajouté', 'CV aggiunto', 'CV añadido', 'Currículo adicionado'],
  'not reviewed yet': ['noch nicht geprüft', 'pas encore évalué', 'non ancora valutato', 'aún sin revisar', 'ainda não avaliado'],
  'Upload your CV to get started': ['Lade deinen Lebenslauf hoch, um zu starten', 'Importez votre CV pour commencer', 'Carica il CV per iniziare', 'Sube tu CV para empezar', 'Envie seu currículo para começar'],
  'No roles yet': ['Noch keine Stellen', 'Aucun poste encore', 'Nessun ruolo ancora', 'Aún sin puestos', 'Nenhum cargo ainda'],
  'None added': ['Keine hinzugefügt', 'Aucun ajouté', 'Nessuno aggiunto', 'Ninguno añadido', 'Nenhum adicionado'],
  'Your master CV. Claude reviews it and rewrites it for every job you apply to.': ['Dein Haupt-Lebenslauf. Claude prüft ihn und schreibt ihn für jede Bewerbung um.', 'Votre CV principal. Claude l’évalue et le réécrit pour chaque candidature.', 'Il tuo CV principale. Claude lo valuta e lo riscrive per ogni candidatura.', 'Tu CV principal. Claude lo revisa y lo reescribe para cada candidatura.', 'Seu currículo principal. O Claude avalia e reescreve para cada candidatura.'],
  'Edit CV text': ['Text des Lebenslaufs bearbeiten', 'Modifier le texte du CV', 'Modifica il testo del CV', 'Editar texto del CV', 'Editar texto do currículo'],
  'This is the text Claude works from. Fix anything the file reader got wrong.': ['Mit diesem Text arbeitet Claude. Korrigiere, was beim Einlesen falsch wurde.', 'C’est le texte utilisé par Claude. Corrigez ce que la lecture a mal compris.', 'È il testo usato da Claude. Correggi ciò che la lettura ha sbagliato.', 'Este es el texto con el que trabaja Claude. Corrige lo que la lectura haya entendido mal.', 'Este é o texto que o Claude usa. Corrija o que a leitura entendeu errado.'],
  'About you': ['Über dich', 'À propos de vous', 'Su di te', 'Sobre ti', 'Sobre você'],
  'Shown at the top of every CV and cover letter Claude writes.': ['Steht oben auf jedem Lebenslauf und Anschreiben, das Claude schreibt.', 'Affiché en haut de chaque CV et lettre écrits par Claude.', 'In cima a ogni CV e lettera scritti da Claude.', 'Aparece arriba en cada CV y carta que escribe Claude.', 'Aparece no topo de cada currículo e carta que o Claude escreve.'],
  'Used to find jobs near you.': ['Wird genutzt, um Jobs in deiner Nähe zu finden.', 'Sert à trouver des offres près de chez vous.', 'Serve a trovare offerte vicino a te.', 'Sirve para encontrar empleos cerca de ti.', 'Usado para achar vagas perto de você.'],
  'One line about what you do and what you are good at.': ['Eine Zeile dazu, was du machst und worin du gut bist.', 'Une ligne sur ce que vous faites et vos points forts.', 'Una riga su cosa fai e in cosa sei bravo.', 'Una línea sobre lo que haces y en qué eres bueno.', 'Uma linha sobre o que você faz e no que é bom.'],
  'Job preferences': ['Jobwünsche', 'Préférences', 'Preferenze di lavoro', 'Preferencias de empleo', 'Preferências de vaga'],
  'Claude uses these to search, rank matches and write your cover letters.': ['Claude nutzt das für die Suche, die Reihenfolge der Treffer und deine Anschreiben.', 'Claude s’en sert pour chercher, classer les offres et écrire vos lettres.', 'Claude le usa per cercare, ordinare le offerte e scrivere le lettere.', 'Claude las usa para buscar, ordenar ofertas y escribir tus cartas.', 'O Claude usa isso para buscar, ordenar vagas e escrever suas cartas.'],
  'Roles you want': ['Gewünschte Stellen', 'Postes recherchés', 'Ruoli desiderati', 'Puestos que buscas', 'Cargos desejados'],
  'Up to 6. The first one is used for your daily "Jobs for you".': ['Bis zu 6. Die erste wird für deine täglichen «Jobs für dich» genutzt.', 'Jusqu’à 6. Le premier sert pour vos « Offres pour vous » du jour.', 'Fino a 6. Il primo serve per le tue «Offerte per te» quotidiane.', 'Hasta 6. El primero se usa para tus «Empleos para ti» diarios.', 'Até 6. O primeiro é usado nas suas "Vagas para você" diárias.'],
  'Work mode': ['Arbeitsform', 'Mode de travail', 'Modalità di lavoro', 'Modalidad', 'Modelo de trabalho'],
  'Employment type': ['Anstellungsart', 'Type de contrat', 'Tipo di contratto', 'Tipo de contrato', 'Tipo de contrato'],
  'Minimum salary': ['Mindestlohn', 'Salaire minimum', 'Stipendio minimo', 'Salario mínimo', 'Salário mínimo'],
  'Private. Used to flag roles that pay below what you want.': ['Privat. Damit werden Stellen markiert, die weniger zahlen, als du willst.', 'Privé. Sert à signaler les postes payés moins que souhaité.', 'Privato. Serve a segnalare i ruoli pagati meno di quanto vuoi.', 'Privado. Sirve para marcar puestos que pagan menos de lo que quieres.', 'Privado. Serve para marcar vagas que pagam menos do que você quer.'],
  'Available to start': ['Verfügbar ab', 'Disponible à partir de', 'Disponibile da', 'Disponible para empezar', 'Disponível para começar'],
  'Work authorisation': ['Arbeitsbewilligung', 'Autorisation de travail', 'Permesso di lavoro', 'Permiso de trabajo', 'Autorização de trabalho'],
  'I am open to relocating for the right role': ['Für die richtige Stelle würde ich umziehen', 'Je suis prêt·e à déménager pour le bon poste', 'Sono disposto a trasferirmi per il ruolo giusto', 'Estoy dispuesto a mudarme por el puesto adecuado', 'Estou aberto a me mudar pela vaga certa'],
  'Skills and languages': ['Fähigkeiten und Sprachen', 'Compétences et langues', 'Competenze e lingue', 'Habilidades e idiomas', 'Habilidades e idiomas'],
  'Add skills as tags. Claude matches them against job postings.': ['Füge Fähigkeiten als Stichworte hinzu. Claude gleicht sie mit Inseraten ab.', 'Ajoutez vos compétences en étiquettes. Claude les compare aux annonces.', 'Aggiungi le competenze come tag. Claude le confronta con gli annunci.', 'Añade habilidades como etiquetas. Claude las compara con los anuncios.', 'Adicione habilidades como etiquetas. O Claude compara com os anúncios.'],
  'Added to the contact line of your tailored CVs.': ['Wird in die Kontaktzeile deiner angepassten Lebensläufe übernommen.', 'Ajouté à la ligne de contact de vos CV adaptés.', 'Aggiunto alla riga dei contatti dei CV su misura.', 'Se añade a la línea de contacto de tus CV adaptados.', 'Adicionado à linha de contato dos currículos adaptados.'],
  'Portfolio or website': ['Portfolio oder Website', 'Portfolio ou site web', 'Portfolio o sito web', 'Portafolio o web', 'Portfólio ou site'],
  'Portfolio': ['Portfolio', 'Portfolio', 'Portfolio', 'Portafolio', 'Portfólio'],
  'Profile sections': ['Profilbereiche', 'Sections du profil', 'Sezioni del profilo', 'Secciones del perfil', 'Seções do perfil'],
  'Complete your profile': ['Vervollständige dein Profil', 'Complétez votre profil', 'Completa il tuo profilo', 'Completa tu perfil', 'Complete seu perfil'],
  'Your tailored CVs': ['Deine angepassten Lebensläufe', 'Vos CV adaptés', 'I tuoi CV su misura', 'Tus CV adaptados', 'Seus currículos adaptados'],
  'When you tailor your CV for a job it shows up here, ready to download again.': ['Wenn du deinen Lebenslauf für einen Job anpasst, erscheint er hier, bereit zum erneuten Herunterladen.', 'Quand vous adaptez votre CV à un poste, il apparaît ici, prêt à être retéléchargé.', 'Quando adatti il CV a un’offerta compare qui, pronto da riscaricare.', 'Cuando adaptas tu CV a un empleo aparece aquí, listo para descargarlo otra vez.', 'Quando você adapta o currículo para uma vaga, ele aparece aqui pronto para baixar de novo.'],
  'Your data': ['Deine Daten', 'Vos données', 'I tuoi dati', 'Tus datos', 'Seus dados'],
  'Your profile and CV stay on this device. They are only sent to Claude when you ask it to search, review or write something.': ['Dein Profil und Lebenslauf bleiben auf diesem Gerät. Sie gehen nur an Claude, wenn du es suchen, prüfen oder schreiben lässt.', 'Votre profil et votre CV restent sur cet appareil. Ils ne sont envoyés à Claude que si vous lui demandez de chercher, évaluer ou écrire.', 'Profilo e CV restano su questo dispositivo. Vengono inviati a Claude solo quando gli chiedi di cercare, valutare o scrivere.', 'Tu perfil y tu CV se quedan en este dispositivo. Solo se envían a Claude cuando le pides buscar, revisar o escribir algo.', 'Seu perfil e currículo ficam neste dispositivo. Só vão para o Claude quando você pede para buscar, avaliar ou escrever.'],
  'Back up or delete data': ['Daten sichern oder löschen', 'Sauvegarder ou supprimer', 'Salva o elimina i dati', 'Copia o borra tus datos', 'Fazer backup ou apagar dados'],
  'Write a headline': ['Kurzprofil schreiben', 'Écrire un titre', 'Scrivi un titolo', 'Escribe un titular', 'Escreva um título'],
  'Add contact details': ['Kontaktdaten hinzufügen', 'Ajouter vos coordonnées', 'Aggiungi i contatti', 'Añade tus datos de contacto', 'Adicionar contatos'],
  'Choose the roles you want': ['Gewünschte Stellen wählen', 'Choisir les postes voulus', 'Scegli i ruoli desiderati', 'Elige los puestos que buscas', 'Escolher os cargos desejados'],
  'Set work mode and type': ['Arbeitsform und Anstellung wählen', 'Choisir le mode et le type', 'Scegli modalità e contratto', 'Elige modalidad y contrato', 'Definir modelo e contrato'],
  'Add your skills': ['Fähigkeiten hinzufügen', 'Ajouter vos compétences', 'Aggiungi le competenze', 'Añade tus habilidades', 'Adicionar habilidades'],
  'Add languages': ['Sprachen hinzufügen', 'Ajouter vos langues', 'Aggiungi le lingue', 'Añade idiomas', 'Adicionar idiomas'],
  'Add a link': ['Link hinzufügen', 'Ajouter un lien', 'Aggiungi un link', 'Añade un enlace', 'Adicionar um link'],

  // Settings
  'Language': ['Sprache', 'Langue', 'Lingua', 'Idioma', 'Idioma'],
  'App language': ['Sprache der App', 'Langue de l’app', 'Lingua dell’app', 'Idioma de la app', 'Idioma do app'],
  'Menus, buttons and Claude’s coaching (fit analysis, CV review, company profiles, interview game) use this language. Your CVs and cover letters are written in the language of each job posting.': [
    'Menüs, Schaltflächen und Claudes Coaching (Passungsanalyse, Lebenslauf-Check, Firmenprofile, Interview-Spiel) nutzen diese Sprache. Lebensläufe und Anschreiben werden in der Sprache des jeweiligen Inserats geschrieben.',
    'Les menus, boutons et le coaching de Claude (analyse d’adéquation, évaluation du CV, profils d’entreprise, jeu d’entretien) utilisent cette langue. Vos CV et lettres sont écrits dans la langue de chaque annonce.',
    'Menu, pulsanti e il coaching di Claude (analisi di idoneità, valutazione del CV, profili aziendali, gioco del colloquio) usano questa lingua. CV e lettere sono scritti nella lingua di ogni annuncio.',
    'Los menús, botones y el coaching de Claude (análisis de encaje, revisión del CV, perfiles de empresa, juego de entrevista) usan este idioma. Tus CV y cartas se escriben en el idioma de cada anuncio.',
    'Menus, botões e o coaching do Claude (análise de compatibilidade, avaliação do currículo, perfis de empresa, jogo de entrevista) usam este idioma. Currículos e cartas são escritos no idioma de cada anúncio.',
  ],
  'AI': ['KI', 'IA', 'IA', 'IA', 'IA'],
  'AI features run on your Claude account here, so no API key is needed. The key and model settings below apply when you run the app outside the Claude app.': ['KI-Funktionen laufen hier über dein Claude-Konto, du brauchst keinen API-Schlüssel. Schlüssel und Modell unten gelten, wenn du die App ausserhalb von Claude nutzt.', 'Ici, les fonctions IA utilisent votre compte Claude : aucune clé API n’est nécessaire. La clé et le modèle ci-dessous servent quand l’app tourne hors de Claude.', 'Qui le funzioni IA usano il tuo account Claude, quindi non serve una chiave API. Chiave e modello qui sotto valgono fuori da Claude.', 'Aquí las funciones de IA usan tu cuenta de Claude, así que no necesitas clave API. La clave y el modelo de abajo se usan fuera de Claude.', 'Aqui os recursos de IA usam sua conta do Claude, então não precisa de chave de API. A chave e o modelo abaixo valem fora do Claude.'],
  'Anthropic API key': ['Anthropic-API-Schlüssel', 'Clé API Anthropic', 'Chiave API Anthropic', 'Clave API de Anthropic', 'Chave de API da Anthropic'],
  'Get one at console.anthropic.com. Stored only in this browser and sent only to api.anthropic.com.': ['Erhältlich auf console.anthropic.com. Nur in diesem Browser gespeichert und nur an api.anthropic.com gesendet.', 'À obtenir sur console.anthropic.com. Stockée seulement dans ce navigateur et envoyée seulement à api.anthropic.com.', 'Si ottiene su console.anthropic.com. Salvata solo in questo browser e inviata solo a api.anthropic.com.', 'Consíguela en console.anthropic.com. Se guarda solo en este navegador y solo se envía a api.anthropic.com.', 'Obtenha em console.anthropic.com. Guardada só neste navegador e enviada só para api.anthropic.com.'],
  'Claude Opus 5.5 (best quality)': ['Claude Opus 5.5 (beste Qualität)', 'Claude Opus 5.5 (meilleure qualité)', 'Claude Opus 5.5 (qualità migliore)', 'Claude Opus 5.5 (mejor calidad)', 'Claude Opus 5.5 (melhor qualidade)'],
  'Claude Sonnet 5.5 (faster, cheaper)': ['Claude Sonnet 5.5 (schneller, günstiger)', 'Claude Sonnet 5.5 (plus rapide, moins cher)', 'Claude Sonnet 5.5 (più veloce, più economico)', 'Claude Sonnet 5.5 (más rápido, más barato)', 'Claude Sonnet 5.5 (mais rápido, mais barato)'],
  'low': ['niedrig', 'faible', 'basso', 'bajo', 'baixo'],
  'medium': ['mittel', 'moyen', 'medio', 'medio', 'médio'],
  'high': ['hoch', 'élevé', 'alto', 'alto', 'alto'],
  'Model': ['Modell', 'Modèle', 'Modello', 'Modelo', 'Modelo'],
  'Effort': ['Aufwand', 'Effort', 'Impegno', 'Esfuerzo', 'Esforço'],
  'Higher effort gives more thorough results but takes longer.': ['Mehr Aufwand liefert gründlichere Ergebnisse, dauert aber länger.', 'Plus d’effort donne des résultats plus complets mais prend plus de temps.', 'Più impegno dà risultati più accurati ma richiede più tempo.', 'Más esfuerzo da resultados más completos pero tarda más.', 'Mais esforço dá resultados mais completos, mas demora mais.'],
  'Save settings': ['Einstellungen speichern', 'Enregistrer', 'Salva impostazioni', 'Guardar ajustes', 'Salvar configurações'],
  'Settings saved': ['Einstellungen gespeichert', 'Paramètres enregistrés', 'Impostazioni salvate', 'Ajustes guardados', 'Configurações salvas'],
  'Export backup': ['Sicherung exportieren', 'Exporter une sauvegarde', 'Esporta backup', 'Exportar copia', 'Exportar backup'],
  'Import backup': ['Sicherung importieren', 'Importer une sauvegarde', 'Importa backup', 'Importar copia', 'Importar backup'],
  'Backup restored': ['Sicherung wiederhergestellt', 'Sauvegarde restaurée', 'Backup ripristinato', 'Copia restaurada', 'Backup restaurado'],
  'That file is not a valid backup.': ['Diese Datei ist keine gültige Sicherung.', 'Ce fichier n’est pas une sauvegarde valide.', 'Il file non è un backup valido.', 'El archivo no es una copia válida.', 'O arquivo não é um backup válido.'],
  'Erase all data': ['Alle Daten löschen', 'Tout effacer', 'Cancella tutti i dati', 'Borrar todos los datos', 'Apagar todos os dados'],
  'Tap again to erase everything': ['Zum Löschen nochmals tippen', 'Touchez à nouveau pour tout effacer', 'Tocca di nuovo per cancellare tutto', 'Toca otra vez para borrarlo todo', 'Toque de novo para apagar tudo'],
  'All data erased': ['Alle Daten gelöscht', 'Toutes les données effacées', 'Tutti i dati cancellati', 'Datos borrados', 'Todos os dados apagados'],
  'Everything is stored locally in this browser. Export a backup to move it to another device.': ['Alles ist lokal in diesem Browser gespeichert. Exportiere eine Sicherung, um es auf ein anderes Gerät zu bringen.', 'Tout est stocké dans ce navigateur. Exportez une sauvegarde pour le transférer sur un autre appareil.', 'Tutto è salvato in questo browser. Esporta un backup per spostarlo su un altro dispositivo.', 'Todo se guarda en este navegador. Exporta una copia para pasarlo a otro dispositivo.', 'Tudo fica salvo neste navegador. Exporte um backup para levar a outro dispositivo.'],

  // Account
  'Manage account': ['Konto verwalten', 'Gérer le compte', 'Gestisci account', 'Gestionar cuenta', 'Gerenciar conta'],
  'Create account or sign in': ['Konto erstellen oder anmelden', 'Créer un compte ou se connecter', 'Crea un account o accedi', 'Crear cuenta o iniciar sesión', 'Criar conta ou entrar'],
  'Account and sync': ['Konto und Synchronisierung', 'Compte et synchronisation', 'Account e sincronizzazione', 'Cuenta y sincronización', 'Conta e sincronização'],
  'Sign in to keep your profile, applications and documents in your account and use them on every device.': ['Melde dich an, um Profil, Bewerbungen und Dokumente in deinem Konto zu behalten und auf jedem Gerät zu nutzen.', 'Connectez-vous pour garder profil, candidatures et documents dans votre compte et les utiliser sur tous vos appareils.', 'Accedi per tenere profilo, candidature e documenti nel tuo account e usarli su ogni dispositivo.', 'Inicia sesión para guardar perfil, candidaturas y documentos en tu cuenta y usarlos en cualquier dispositivo.', 'Entre para guardar perfil, candidaturas e documentos na sua conta e usar em qualquer dispositivo.'],
  'Syncing…': ['Synchronisiert…', 'Synchronisation…', 'Sincronizzazione…', 'Sincronizando…', 'Sincronizando…'],
  'Account': ['Konto', 'Compte', 'Account', 'Cuenta', 'Conta'],
  'Signing in…': ['Anmeldung…', 'Connexion…', 'Accesso…', 'Iniciando sesión…', 'Entrando…'],
  'Sync now': ['Jetzt synchronisieren', 'Synchroniser', 'Sincronizza ora', 'Sincronizar ahora', 'Sincronizar agora'],
  'Sign out': ['Abmelden', 'Se déconnecter', 'Esci', 'Cerrar sesión', 'Sair'],
  'Signed out. Your data stays on this device.': ['Abgemeldet. Deine Daten bleiben auf diesem Gerät.', 'Déconnecté. Vos données restent sur cet appareil.', 'Disconnesso. I tuoi dati restano su questo dispositivo.', 'Sesión cerrada. Tus datos se quedan en este dispositivo.', 'Você saiu. Seus dados ficam neste dispositivo.'],
  'Sign out and remove data from this device': ['Abmelden und Daten von diesem Gerät entfernen', 'Se déconnecter et effacer les données de cet appareil', 'Esci e rimuovi i dati da questo dispositivo', 'Cerrar sesión y borrar los datos de este dispositivo', 'Sair e remover os dados deste dispositivo'],
  'Tap again to remove it from this device': ['Nochmals tippen, um es von diesem Gerät zu entfernen', 'Touchez à nouveau pour l’effacer de cet appareil', 'Tocca di nuovo per rimuoverlo da questo dispositivo', 'Toca otra vez para borrarlo de este dispositivo', 'Toque de novo para remover deste dispositivo'],
  'Signed out and removed from this device': ['Abgemeldet und von diesem Gerät entfernt', 'Déconnecté et effacé de cet appareil', 'Disconnesso e rimosso da questo dispositivo', 'Sesión cerrada y datos borrados de este dispositivo', 'Saiu e removeu os dados deste dispositivo'],
  'Your account': ['Dein Konto', 'Votre compte', 'Il tuo account', 'Tu cuenta', 'Sua conta'],
  'saved jobs': ['gespeicherte Jobs', 'offres enregistrées', 'offerte salvate', 'empleos guardados', 'vagas salvas'],
  'tailored CVs': ['angepasste Lebensläufe', 'CV adaptés', 'CV su misura', 'CV adaptados', 'currículos adaptados'],
  'Accounts': ['Konten', 'Comptes', 'Account', 'Cuentas', 'Contas'],
  'Accounts are not available in this view. Open Vora from your own Claude app to sign in.': ['Konten sind in dieser Ansicht nicht verfügbar. Öffne Vora in deiner eigenen Claude-App, um dich anzumelden.', 'Les comptes ne sont pas disponibles ici. Ouvrez Vora dans votre app Claude pour vous connecter.', 'Gli account non sono disponibili qui. Apri Vora nella tua app Claude per accedere.', 'Las cuentas no están disponibles aquí. Abre Vora en tu app de Claude para iniciar sesión.', 'Contas não estão disponíveis aqui. Abra o Vora no seu app do Claude para entrar.'],
  'Accounts work when you open Vora in the Claude app, where you sign in with your Claude account. Here, your data is saved on this device.': ['Konten funktionieren, wenn du Vora in der Claude-App öffnest; dort meldest du dich mit deinem Claude-Konto an. Hier werden deine Daten auf diesem Gerät gespeichert.', 'Les comptes fonctionnent quand vous ouvrez Vora dans l’app Claude, avec votre compte Claude. Ici, vos données sont enregistrées sur cet appareil.', 'Gli account funzionano quando apri Vora nell’app Claude, dove accedi con il tuo account Claude. Qui i dati sono salvati su questo dispositivo.', 'Las cuentas funcionan al abrir Vora en la app de Claude, donde inicias sesión con tu cuenta de Claude. Aquí tus datos se guardan en este dispositivo.', 'As contas funcionam ao abrir o Vora no app do Claude, onde você entra com sua conta do Claude. Aqui seus dados ficam neste dispositivo.'],
  'Back up my data': ['Meine Daten sichern', 'Sauvegarder mes données', 'Salva i miei dati', 'Copiar mis datos', 'Fazer backup dos meus dados'],
  'Continue with your Claude account': ['Mit deinem Claude-Konto fortfahren', 'Continuer avec votre compte Claude', 'Continua con il tuo account Claude', 'Continuar con tu cuenta de Claude', 'Continuar com sua conta do Claude'],
  'Signed in. Your progress was loaded from your account.': ['Angemeldet. Dein Fortschritt wurde aus deinem Konto geladen.', 'Connecté. Votre progression a été chargée depuis votre compte.', 'Accesso eseguito. I tuoi progressi sono stati caricati dall’account.', 'Sesión iniciada. Tu progreso se cargó desde tu cuenta.', 'Você entrou. Seu progresso foi carregado da sua conta.'],
  'Account ready. Your progress now syncs.': ['Konto bereit. Dein Fortschritt wird jetzt synchronisiert.', 'Compte prêt. Votre progression est synchronisée.', 'Account pronto. I tuoi progressi ora si sincronizzano.', 'Cuenta lista. Tu progreso ya se sincroniza.', 'Conta pronta. Seu progresso agora sincroniza.'],
  'Could not sign in. Try again.': ['Anmeldung fehlgeschlagen. Versuche es erneut.', 'Connexion impossible. Réessayez.', 'Accesso non riuscito. Riprova.', 'No se pudo iniciar sesión. Inténtalo de nuevo.', 'Não foi possível entrar. Tente de novo.'],
  'Create your account': ['Erstelle dein Konto', 'Créez votre compte', 'Crea il tuo account', 'Crea tu cuenta', 'Crie sua conta'],
  'Save your profile, CV, applications and interview progress, and pick up where you left off on any device.': ['Speichere Profil, Lebenslauf, Bewerbungen und Interview-Fortschritt und mach auf jedem Gerät dort weiter, wo du aufgehört hast.', 'Gardez profil, CV, candidatures et progression d’entretien, et reprenez où vous en étiez sur tout appareil.', 'Salva profilo, CV, candidature e progressi nei colloqui, e riprendi da dove eri su qualsiasi dispositivo.', 'Guarda tu perfil, CV, candidaturas y progreso de entrevistas, y sigue donde lo dejaste en cualquier dispositivo.', 'Salve perfil, currículo, candidaturas e progresso nas entrevistas, e continue de onde parou em qualquer dispositivo.'],
  'Your phone and computer stay in sync': ['Handy und Computer bleiben synchron', 'Téléphone et ordinateur restent synchronisés', 'Telefono e computer restano sincronizzati', 'Tu móvil y tu ordenador siempre sincronizados', 'Celular e computador ficam sincronizados'],
  'Tailored CVs, cover letters and interview games are never lost': ['Angepasste Lebensläufe, Anschreiben und Interview-Spiele gehen nie verloren', 'CV adaptés, lettres et jeux d’entretien ne se perdent jamais', 'CV su misura, lettere e giochi di colloquio non si perdono mai', 'CV adaptados, cartas y juegos de entrevista nunca se pierden', 'Currículos, cartas e jogos de entrevista nunca se perdem'],
  'Private to you. Nobody else can read your data': ['Nur für dich. Niemand sonst kann deine Daten lesen', 'Privé. Personne d’autre ne peut lire vos données', 'Solo tuoi. Nessun altro può leggere i tuoi dati', 'Privado. Nadie más puede leer tus datos', 'Privado. Ninguém mais pode ler seus dados'],
  'No new password. You sign in with the Claude account you already use. Already have an account? The same button signs you in.': ['Kein neues Passwort. Du meldest dich mit deinem bestehenden Claude-Konto an. Schon ein Konto? Derselbe Knopf meldet dich an.', 'Pas de nouveau mot de passe : vous utilisez votre compte Claude. Déjà un compte ? Le même bouton vous connecte.', 'Nessuna nuova password: accedi con l’account Claude che già usi. Hai già un account? Lo stesso pulsante ti fa accedere.', 'Sin contraseña nueva: entras con la cuenta de Claude que ya usas. ¿Ya tienes cuenta? El mismo botón te conecta.', 'Sem senha nova: você entra com a conta do Claude que já usa. Já tem conta? O mesmo botão faz o login.'],
  'Your cloud space is full. Remove some old jobs, then sync again.': ['Dein Cloud-Speicher ist voll. Entferne alte Jobs und synchronisiere erneut.', 'Votre espace est plein. Supprimez d’anciennes offres puis synchronisez.', 'Il tuo spazio è pieno. Rimuovi vecchie offerte e sincronizza di nuovo.', 'Tu espacio está lleno. Quita empleos antiguos y vuelve a sincronizar.', 'Seu espaço está cheio. Remova vagas antigas e sincronize de novo.'],
  'Could not reach your account. Changes are kept on this device and will sync later.': ['Dein Konto ist nicht erreichbar. Änderungen bleiben auf diesem Gerät und werden später synchronisiert.', 'Compte injoignable. Les modifications restent sur cet appareil et seront synchronisées plus tard.', 'Account non raggiungibile. Le modifiche restano qui e si sincronizzeranno dopo.', 'No se pudo conectar con tu cuenta. Los cambios se guardan aquí y se sincronizarán después.', 'Não foi possível acessar sua conta. As mudanças ficam aqui e sincronizam depois.'],

  // Install
  'Installed! Find Vora on your home screen.': ['Installiert! Du findest Vora auf deinem Startbildschirm.', 'Installé ! Vora est sur votre écran d’accueil.', 'Installata! Trovi Vora nella schermata Home.', '¡Instalada! Encontrarás Vora en tu pantalla de inicio.', 'Instalado! O Vora está na sua tela inicial.'],
  'Install as an app': ['Als App installieren', 'Installer comme une app', 'Installa come app', 'Instalar como app', 'Instalar como app'],

  // Interview game
  'Story time': ['Erzähl mal', 'Racontez', 'Raccontami', 'Cuéntame', 'Conte uma história'],
  'Skills check': ['Fachfrage', 'Compétences', 'Competenze', 'Habilidades', 'Habilidades'],
  'Motivation': ['Motivation', 'Motivation', 'Motivazione', 'Motivación', 'Motivação'],
  'Curveball': ['Überraschung', 'Question piège', 'Domanda a sorpresa', 'Pregunta trampa', 'Pegadinha'],
  'Company fit': ['Passt zur Firma', 'Culture d’entreprise', 'Affinità con l’azienda', 'Encaje con la empresa', 'Afinidade com a empresa'],
  'Deal the cards': ['Karten austeilen', 'Distribuer les cartes', 'Distribuisci le carte', 'Repartir cartas', 'Distribuir as cartas'],
  'Interview Deck': ['Interview-Deck', 'Jeu d’entretien', 'Mazzo del colloquio', 'Baraja de entrevista', 'Baralho de entrevista'],
  'Shuffling…': ['Mischen…', 'Mélange…', 'Mescolo…', 'Barajando…', 'Embaralhando…'],
  'Claude is writing questions for this job. About 20 seconds.': ['Claude schreibt Fragen für diesen Job. Etwa 20 Sekunden.', 'Claude écrit des questions pour ce poste. Environ 20 secondes.', 'Claude sta scrivendo domande per questa offerta. Circa 20 secondi.', 'Claude está escribiendo preguntas para este empleo. Unos 20 segundos.', 'O Claude está escrevendo perguntas para esta vaga. Uns 20 segundos.'],
  'No questions came back. Try again.': ['Keine Fragen erhalten. Versuche es erneut.', 'Aucune question reçue. Réessayez.', 'Nessuna domanda ricevuta. Riprova.', 'No llegaron preguntas. Inténtalo de nuevo.', 'Nenhuma pergunta recebida. Tente de novo.'],
  'Allow Claude for this page, or add an API key in Settings.': ['Erlaube Claude für diese Seite oder füge in den Einstellungen einen API-Schlüssel hinzu.', 'Autorisez Claude pour cette page ou ajoutez une clé API dans les paramètres.', 'Consenti Claude per questa pagina o aggiungi una chiave API nelle impostazioni.', 'Permite Claude en esta página o añade una clave API en Ajustes.', 'Permita o Claude nesta página ou adicione uma chave de API nas configurações.'],
  'Read the question aloud': ['Frage vorlesen', 'Lire la question à voix haute', 'Leggi la domanda ad alta voce', 'Leer la pregunta en voz alta', 'Ler a pergunta em voz alta'],
  'Read aloud': ['Vorlesen', 'Lire à voix haute', 'Leggi ad alta voce', 'Leer en voz alta', 'Ler em voz alta'],
  'Say it like you would in the room. Type, or tap the mic.': ['Sag es so wie im Gespräch. Tippe oder tippe aufs Mikrofon.', 'Dites-le comme en entretien. Tapez ou touchez le micro.', 'Dillo come faresti al colloquio. Scrivi o tocca il microfono.', 'Dilo como lo harías en la sala. Escribe o toca el micro.', 'Fale como faria na sala. Digite ou toque no microfone.'],
  'Answer with your voice': ['Mit der Stimme antworten', 'Répondre à voix haute', 'Rispondi con la voce', 'Responder con tu voz', 'Responder com sua voz'],
  'Speak': ['Sprechen', 'Parler', 'Parla', 'Hablar', 'Falar'],
  'Lock in answer': ['Antwort abgeben', 'Valider la réponse', 'Conferma risposta', 'Confirmar respuesta', 'Confirmar resposta'],
  'Skip': ['Überspringen', 'Passer', 'Salta', 'Saltar', 'Pular'],
  'Skipped': ['Übersprungen', 'Passée', 'Saltata', 'Saltada', 'Pulada'],
  'Read questions aloud': ['Fragen vorlesen', 'Lire les questions', 'Leggi le domande', 'Leer las preguntas', 'Ler as perguntas'],
  'Wrap it up': ['Zum Schluss kommen', 'Concluez', 'Concludi', 'Ve terminando', 'Finalize'],
  'Give it a proper go first, even a few sentences.': ['Versuch es zuerst richtig, auch nur ein paar Sätze.', 'Essayez d’abord vraiment, même quelques phrases.', 'Prima provaci davvero, anche solo qualche frase.', 'Inténtalo primero de verdad, aunque sean unas frases.', 'Tente de verdade primeiro, nem que sejam algumas frases.'],
  'Judging…': ['Wird bewertet…', 'Évaluation…', 'Valutazione…', 'Evaluando…', 'Avaliando…'],
  'Listening… tap to stop': ['Hört zu… zum Stoppen tippen', 'Écoute… touchez pour arrêter', 'In ascolto… tocca per fermare', 'Escuchando… toca para parar', 'Ouvindo… toque para parar'],
  'Didn’t catch that. Tap Speak to try again.': ['Nicht verstanden. Tippe auf «Sprechen» für einen neuen Versuch.', 'Pas compris. Touchez « Parler » pour réessayer.', 'Non ho capito. Tocca «Parla» per riprovare.', 'No lo entendí. Toca «Hablar» para intentarlo otra vez.', 'Não entendi. Toque em "Falar" para tentar de novo.'],
  'Read the stronger answer aloud': ['Stärkere Antwort vorlesen', 'Lire la meilleure réponse', 'Leggi la risposta migliore', 'Leer la mejor respuesta', 'Ler a resposta melhor'],
  'Keep going': ['Weiter so', 'Continuez', 'Continua così', 'Sigue así', 'Continue'],
  'Nice': ['Gut', 'Bien', 'Bene', 'Bien', 'Boa'],
  'Strong answer': ['Starke Antwort', 'Bonne réponse', 'Ottima risposta', 'Buena respuesta', 'Ótima resposta'],
  'Nailed it': ['Volltreffer', 'Parfait', 'Perfetto', '¡Clavada!', 'Mandou bem'],
  'Worked': ['Hat funktioniert', 'Réussi', 'Ha funzionato', 'Funcionó', 'Funcionou'],
  'Next time': ['Nächstes Mal', 'La prochaine fois', 'La prossima volta', 'La próxima vez', 'Da próxima vez'],
  'Hear a stronger answer': ['Stärkere Antwort anhören', 'Écouter une meilleure réponse', 'Ascolta una risposta migliore', 'Escuchar una mejor respuesta', 'Ouvir uma resposta melhor'],
  'Try this card again': ['Diese Karte nochmals', 'Rejouer cette carte', 'Riprova questa carta', 'Repetir esta carta', 'Tentar esta carta de novo'],
  'See my results': ['Meine Ergebnisse', 'Voir mes résultats', 'Vedi i miei risultati', 'Ver mis resultados', 'Ver meus resultados'],
  'Next card': ['Nächste Karte', 'Carte suivante', 'Prossima carta', 'Siguiente carta', 'Próxima carta'],
  'Finish early': ['Früher beenden', 'Terminer maintenant', 'Termina prima', 'Terminar antes', 'Terminar antes'],
  'You said': ['Du hast gesagt', 'Vous avez dit', 'Hai detto', 'Dijiste', 'Você disse'],
  'Not answered.': ['Nicht beantwortet.', 'Sans réponse.', 'Senza risposta.', 'Sin responder.', 'Não respondida.'],
  'Stronger answer': ['Stärkere Antwort', 'Meilleure réponse', 'Risposta migliore', 'Mejor respuesta', 'Resposta melhor'],
  'New deck': ['Neues Deck', 'Nouveau jeu', 'Nuovo mazzo', 'Nueva baraja', 'Novo baralho'],
  'Your rank': ['Dein Rang', 'Votre niveau', 'Il tuo livello', 'Tu nivel', 'Seu nível'],
  'avg stars': ['Ø Sterne', 'étoiles moy.', 'stelle medie', 'estrellas media', 'média de estrelas'],
  'Your cards': ['Deine Karten', 'Vos cartes', 'Le tue carte', 'Tus cartas', 'Suas cartas'],
  'Tap a card to see your answer and a stronger version.': ['Tippe auf eine Karte für deine Antwort und eine stärkere Version.', 'Touchez une carte pour voir votre réponse et une meilleure version.', 'Tocca una carta per vedere la tua risposta e una versione migliore.', 'Toca una carta para ver tu respuesta y una versión mejor.', 'Toque numa carta para ver sua resposta e uma versão melhor.'],
  'Bonus card': ['Bonuskarte', 'Carte bonus', 'Carta bonus', 'Carta extra', 'Carta bônus'],
  'Questions to ask them': ['Fragen, die du stellen kannst', 'Questions à leur poser', 'Domande da fare a loro', 'Preguntas para hacerles', 'Perguntas para fazer a eles'],
  'Warming up': ['Aufwärmen', 'Échauffement', 'Riscaldamento', 'Calentando', 'Aquecendo'],
  'Every answer you practise now is one you won’t fumble later.': ['Jede Antwort, die du jetzt übst, vermasselst du später nicht.', 'Chaque réponse travaillée maintenant ne vous fera pas défaut plus tard.', 'Ogni risposta che alleni ora è una che non sbaglierai dopo.', 'Cada respuesta que practicas ahora es una que no fallarás después.', 'Cada resposta treinada agora é uma que você não vai errar depois.'],
  'Getting there': ['Auf gutem Weg', 'Ça progresse', 'Ci sei quasi', 'Vas bien', 'Quase lá'],
  'Good bones. Tighten the stories and add a result to each.': ['Gute Basis. Strafft die Geschichten und nenne bei jeder ein Ergebnis.', 'Bonne base. Resserrez vos histoires et ajoutez un résultat à chacune.', 'Buona base. Stringi le storie e aggiungi un risultato a ognuna.', 'Buena base. Acorta las historias y añade un resultado a cada una.', 'Boa base. Enxugue as histórias e inclua um resultado em cada.'],
  'Interview ready': ['Bereit fürs Interview', 'Prêt pour l’entretien', 'Pronto per il colloquio', 'Listo para la entrevista', 'Pronto para a entrevista'],
  'You can walk in tomorrow. Polish the weaker cards and go.': ['Du könntest morgen hingehen. Feile an den schwächeren Karten und los.', 'Vous pourriez y aller demain. Peaufinez les cartes faibles et foncez.', 'Potresti andarci domani. Rifinisci le carte più deboli e vai.', 'Podrías ir mañana. Pule las cartas más flojas y adelante.', 'Você poderia ir amanhã. Melhore as cartas mais fracas e vá.'],
  'Offer magnet': ['Angebotsmagnet', 'Aimant à offres', 'Calamita di offerte', 'Imán de ofertas', 'Ímã de ofertas'],
  'Strong, specific answers across the board. Go get it.': ['Starke, konkrete Antworten überall. Hol ihn dir.', 'Des réponses solides et précises partout. Foncez.', 'Risposte forti e concrete su tutto. Vai a prendertelo.', 'Respuestas sólidas y concretas en todo. A por ello.', 'Respostas fortes e específicas em tudo. Vá buscar.'],
  'Voice input isn’t available on this page. Tap the box and use the microphone key on your keyboard to dictate your answer.': ['Spracheingabe ist auf dieser Seite nicht verfügbar. Tippe ins Feld und nutze die Mikrofontaste deiner Tastatur zum Diktieren.', 'La saisie vocale n’est pas disponible ici. Touchez le champ et utilisez la touche micro de votre clavier pour dicter.', 'L’input vocale non è disponibile qui. Tocca il campo e usa il tasto microfono della tastiera per dettare.', 'La entrada de voz no está disponible aquí. Toca el cuadro y usa la tecla de micrófono del teclado para dictar.', 'A entrada de voz não está disponível aqui. Toque na caixa e use a tecla de microfone do teclado para ditar.'],
  'The microphone is blocked. Allow it in your browser, or use the microphone key on your keyboard to dictate.': ['Das Mikrofon ist blockiert. Erlaube es im Browser oder nutze die Mikrofontaste deiner Tastatur.', 'Le micro est bloqué. Autorisez-le dans le navigateur ou utilisez la touche micro du clavier.', 'Il microfono è bloccato. Consentilo nel browser o usa il tasto microfono della tastiera.', 'El micrófono está bloqueado. Permítelo en el navegador o usa la tecla de micrófono del teclado.', 'O microfone está bloqueado. Permita no navegador ou use a tecla de microfone do teclado.'],

  // Errors
  'Add your Anthropic API key in Settings to use AI features.': ['Füge in den Einstellungen deinen Anthropic-API-Schlüssel hinzu, um KI-Funktionen zu nutzen.', 'Ajoutez votre clé API Anthropic dans les paramètres pour utiliser l’IA.', 'Aggiungi la tua chiave API Anthropic nelle impostazioni per usare l’IA.', 'Añade tu clave API de Anthropic en Ajustes para usar la IA.', 'Adicione sua chave de API da Anthropic nas configurações para usar a IA.'],
  'Claude declined this request. Try rephrasing it.': ['Claude hat diese Anfrage abgelehnt. Formuliere sie anders.', 'Claude a refusé cette demande. Reformulez-la.', 'Claude ha rifiutato la richiesta. Prova a riformularla.', 'Claude rechazó la solicitud. Prueba a reformularla.', 'O Claude recusou o pedido. Tente reformular.'],
  'Claude replied in an unexpected format. Try again.': ['Claude hat in einem unerwarteten Format geantwortet. Versuche es erneut.', 'Claude a répondu dans un format inattendu. Réessayez.', 'Claude ha risposto in un formato inatteso. Riprova.', 'Claude respondió en un formato inesperado. Inténtalo de nuevo.', 'O Claude respondeu num formato inesperado. Tente de novo.'],
  'Your Claude session expired. Sign in again and retry.': ['Deine Claude-Sitzung ist abgelaufen. Melde dich erneut an und versuche es nochmals.', 'Votre session Claude a expiré. Reconnectez-vous et réessayez.', 'La sessione Claude è scaduta. Accedi di nuovo e riprova.', 'Tu sesión de Claude caducó. Vuelve a iniciar sesión e inténtalo de nuevo.', 'Sua sessão do Claude expirou. Entre de novo e tente outra vez.'],
  'Your API key was rejected. Check it in Settings.': ['Dein API-Schlüssel wurde abgelehnt. Prüfe ihn in den Einstellungen.', 'Votre clé API a été refusée. Vérifiez-la dans les paramètres.', 'La chiave API è stata rifiutata. Controllala nelle impostazioni.', 'Tu clave API fue rechazada. Revísala en Ajustes.', 'Sua chave de API foi recusada. Verifique nas configurações.'],
  'Could not reach the Anthropic API. Check your connection.': ['Die Anthropic-API ist nicht erreichbar. Prüfe deine Verbindung.', 'Impossible de joindre l’API Anthropic. Vérifiez votre connexion.', 'Impossibile raggiungere l’API Anthropic. Controlla la connessione.', 'No se pudo conectar con la API de Anthropic. Revisa tu conexión.', 'Não foi possível acessar a API da Anthropic. Verifique sua conexão.'],
  'Reading the postings…': ['Inserate werden gelesen…', 'Lecture des annonces…', 'Lettura degli annunci…', 'Leyendo los anuncios…', 'Lendo os anúncios…'],
  'Live job search needs the Exa connector. Add it in claude.ai Settings → Connectors, then reload.': ['Die Live-Jobsuche braucht den Exa-Connector. Füge ihn in claude.ai unter Einstellungen → Connectors hinzu und lade neu.', 'La recherche en direct nécessite le connecteur Exa. Ajoutez-le dans claude.ai Paramètres → Connecteurs, puis rechargez.', 'La ricerca live richiede il connettore Exa. Aggiungilo in claude.ai Impostazioni → Connettori e ricarica.', 'La búsqueda en vivo necesita el conector Exa. Añádelo en claude.ai Ajustes → Conectores y recarga.', 'A busca ao vivo precisa do conector Exa. Adicione em claude.ai Configurações → Conectores e recarregue.'],
  'Company lookup needs the Exa connector. Add it in claude.ai Settings → Connectors, then reload.': ['Die Firmensuche braucht den Exa-Connector. Füge ihn in claude.ai unter Einstellungen → Connectors hinzu und lade neu.', 'La recherche d’entreprise nécessite le connecteur Exa. Ajoutez-le dans claude.ai Paramètres → Connecteurs, puis rechargez.', 'La ricerca aziendale richiede il connettore Exa. Aggiungilo in claude.ai Impostazioni → Connettori e ricarica.', 'La búsqueda de empresas necesita el conector Exa. Añádelo en claude.ai Ajustes → Conectores y recarga.', 'A pesquisa de empresas precisa do conector Exa. Adicione em claude.ai Configurações → Conectores e recarregue.'],
  'The search service did not answer. Try again in a moment.': ['Der Suchdienst hat nicht geantwortet. Versuche es gleich nochmals.', 'Le service de recherche n’a pas répondu. Réessayez dans un instant.', 'Il servizio di ricerca non ha risposto. Riprova tra poco.', 'El servicio de búsqueda no respondió. Inténtalo en un momento.', 'O serviço de busca não respondeu. Tente daqui a pouco.'],
  'Web search is not available right now. Try again later.': ['Die Websuche ist gerade nicht verfügbar. Versuche es später.', 'La recherche web est indisponible. Réessayez plus tard.', 'La ricerca web non è disponibile ora. Riprova più tardi.', 'La búsqueda web no está disponible ahora. Inténtalo más tarde.', 'A busca na web não está disponível agora. Tente mais tarde.'],
  'Add your CV or the roles you want in Profile first.': ['Füge zuerst im Profil deinen Lebenslauf oder deine Wunschstellen hinzu.', 'Ajoutez d’abord votre CV ou les postes voulus dans le profil.', 'Prima aggiungi il CV o i ruoli desiderati nel profilo.', 'Primero añade tu CV o los puestos que buscas en el perfil.', 'Primeiro adicione seu currículo ou os cargos desejados no perfil.'],
  'Could not load jobs.': ['Jobs konnten nicht geladen werden.', 'Impossible de charger les offres.', 'Impossibile caricare le offerte.', 'No se pudieron cargar los empleos.', 'Não foi possível carregar as vagas.'],
  'Showing demo listings': ['Beispielinserate werden gezeigt', 'Annonces d’exemple affichées', 'Annunci di esempio', 'Mostrando anuncios de ejemplo', 'Mostrando anúncios de exemplo'],

  // Job-match reasons (built in match.js through fmt())
  'Partly matches your profile': ['Passt teilweise zu deinem Profil', 'Correspond en partie à votre profil', 'In parte adatto al tuo profilo', 'Encaja en parte con tu perfil', 'Combina em parte com seu perfil'],
  'your kind of role': ['passt zu dir', 'votre type de poste', 'il tuo tipo di ruolo', 'tu tipo de puesto', 'seu tipo de vaga'],
  'remote': ['remote', 'télétravail', 'da remoto', 'remoto', 'remoto'],
  'more junior than you': ['juniorer als du', 'plus junior que vous', 'più junior di te', 'más junior que tú', 'mais júnior que você'],
  'not remote': ['nicht remote', 'pas en télétravail', 'non da remoto', 'no remoto', 'não remoto'],
  'internship': ['Praktikum', 'stage', 'stage', 'prácticas', 'estágio'],
  'freelance': ['Freelance', 'freelance', 'freelance', 'autónomo', 'freelancer'],
  'contract': ['befristet', 'CDD', 'a termine', 'temporal', 'temporário'],
  'part-time': ['Teilzeit', 'temps partiel', 'part-time', 'media jornada', 'meio período'],
  'full-time': ['Vollzeit', 'temps plein', 'tempo pieno', 'jornada completa', 'tempo integral'],
  'entry': ['Einstieg', 'débutant', 'principiante', 'inicial', 'inicial'],
  'junior': ['Junior', 'junior', 'junior', 'junior', 'júnior'],
  'mid': ['mittleres', 'confirmé', 'intermedio', 'intermedio', 'pleno'],
  'senior': ['Senior', 'senior', 'senior', 'sénior', 'sênior'],
  'lead': ['Leitungs', 'direction', 'dirigenziale', 'dirección', 'liderança'],
  'level': ['Niveau', 'niveau', 'livello', 'nivel', 'nível'],
  'and': ['und', 'et', 'e', 'y', 'e'],
  'name': ['Name', 'nom', 'nome', 'nombre', 'nome'],
  'headline': ['Kurzprofil', 'titre', 'titolo', 'titular', 'título'],
  'location': ['Ort', 'lieu', 'città', 'ubicación', 'local'],
  'email': ['E-Mail', 'e-mail', 'e-mail', 'correo', 'e-mail'],
  'phone': ['Telefon', 'téléphone', 'telefono', 'teléfono', 'telefone'],
};

// [regex on the English text, [de, fr, it, es, pt]]; {1}, {2} … are the captured parts.
const PATTERNS = [
  [/^(\d+) min ago$/, ['vor {1} Min.', 'il y a {1} min', '{1} min fa', 'hace {1} min', 'há {1} min']],
  [/^(\d+) h ago$/, ['vor {1} Std.', 'il y a {1} h', '{1} h fa', 'hace {1} h', 'há {1} h']],
  [/^Jobs for you in (.+)$/, ['Jobs für dich in {1}', 'Offres pour vous à {1}', 'Offerte per te a {1}', 'Empleos para ti en {1}', 'Vagas para você em {1}']],
  [/^Searching the job portals for (.+) and matching what you find against your CV\. This takes a few seconds\.$/, ['Die Jobportale für {1} werden durchsucht und mit deinem Lebenslauf abgeglichen. Das dauert ein paar Sekunden.', 'Recherche sur les sites d’emploi pour {1} et comparaison avec votre CV. Quelques secondes.', 'Ricerca sui portali per {1} e confronto con il tuo CV. Qualche secondo.', 'Buscando en los portales para {1} y comparando con tu CV. Unos segundos.', 'Buscando nos portais para {1} e comparando com seu currículo. Alguns segundos.']],
  [/^Searching the job portals and matching what you find against your CV\. This takes a few seconds\.$/, ['Die Jobportale werden durchsucht und mit deinem Lebenslauf abgeglichen. Das dauert ein paar Sekunden.', 'Recherche sur les sites d’emploi et comparaison avec votre CV. Quelques secondes.', 'Ricerca sui portali e confronto con il tuo CV. Qualche secondo.', 'Buscando en los portales y comparando con tu CV. Unos segundos.', 'Buscando nos portais e comparando com seu currículo. Alguns segundos.']],
  [/^(\d+) matches · based on your experience as (.+) · updating…$/, ['{1} Treffer · basierend auf deiner Erfahrung als {2} · wird aktualisiert…', '{1} offres · selon votre expérience de {2} · mise à jour…', '{1} offerte · in base alla tua esperienza come {2} · aggiornamento…', '{1} coincidencias · según tu experiencia como {2} · actualizando…', '{1} vagas · com base na sua experiência como {2} · atualizando…']],
  [/^(\d+) matches · based on your experience as (.+) · updated (.+)$/, ['{1} Treffer · basierend auf deiner Erfahrung als {2} · aktualisiert {3}', '{1} offres · selon votre expérience de {2} · mis à jour {3}', '{1} offerte · in base alla tua esperienza come {2} · aggiornato {3}', '{1} coincidencias · según tu experiencia como {2} · actualizado {3}', '{1} vagas · com base na sua experiência como {2} · atualizado {3}']],
  [/^\+ (\d+) more$/, ['+ {1} weitere', '+ {1} de plus', '+ altri {1}', '+ {1} más', '+ {1} mais']],
  [/^Show (\d+) more$/, ['{1} weitere anzeigen', 'Afficher {1} de plus', 'Mostra altre {1}', 'Mostrar {1} más', 'Mostrar mais {1}']],
  [/^Searched (.+), the open web and free job boards, then matched on this device by job title, skills, location and experience\. No AI is used for these picks\.$/, ['Durchsucht: {1}, das offene Web und kostenlose Jobbörsen, dann auf diesem Gerät nach Jobtitel, Fähigkeiten, Ort und Erfahrung abgeglichen. Für diese Auswahl wird keine KI verwendet.', 'Recherche sur {1}, le web et les sites gratuits, puis tri sur cet appareil selon le poste, les compétences, le lieu et l’expérience. Aucune IA n’est utilisée pour ces choix.', 'Cercato su {1}, il web e le bacheche gratuite, poi abbinato su questo dispositivo per ruolo, competenze, luogo ed esperienza. Per questa selezione non si usa l’IA.', 'Buscado en {1}, la web y portales gratuitos, y luego comparado en este dispositivo por puesto, habilidades, ubicación y experiencia. No se usa IA para esta selección.', 'Busca em {1}, na web e em sites gratuitos, depois comparação neste dispositivo por cargo, habilidades, local e experiência. Nenhuma IA é usada nesta seleção.']],
  [/^Searched the open web and free job boards, then matched on this device by job title, skills, location and experience\. No AI is used for these picks\.$/, ['Das offene Web und kostenlose Jobbörsen durchsucht, dann auf diesem Gerät nach Jobtitel, Fähigkeiten, Ort und Erfahrung abgeglichen. Für diese Auswahl wird keine KI verwendet.', 'Recherche sur le web et les sites gratuits, puis tri sur cet appareil selon le poste, les compétences, le lieu et l’expérience. Aucune IA n’est utilisée pour ces choix.', 'Cercato sul web e sulle bacheche gratuite, poi abbinato su questo dispositivo per ruolo, competenze, luogo ed esperienza. Per questa selezione non si usa l’IA.', 'Buscado en la web y portales gratuitos, y luego comparado en este dispositivo por puesto, habilidades, ubicación y experiencia. No se usa IA para esta selección.', 'Busca na web e em sites gratuitos, depois comparação neste dispositivo por cargo, habilidades, local e experiência. Nenhuma IA é usada nesta seleção.']],
  [/^(\d+) more jobs for you near (.+) that are not on your home page, best match first$/, ['{1} weitere Jobs für dich in der Nähe von {2}, die nicht auf deiner Startseite sind, beste Treffer zuerst', '{1} autres offres pour vous près de {2}, absentes de votre accueil, les meilleures d’abord', 'Altre {1} offerte per te vicino a {2} che non sono nella tua home, le migliori prima', '{1} empleos más para ti cerca de {2} que no están en tu inicio, los mejores primero', 'Mais {1} vagas para você perto de {2} que não estão no seu início, as melhores primeiro']],
  [/^(\d+) more jobs for you near (.+) that are not on your home page, newest first$/, ['{1} weitere Jobs für dich in der Nähe von {2}, die nicht auf deiner Startseite sind, neueste zuerst', '{1} autres offres pour vous près de {2}, absentes de votre accueil, les plus récentes d’abord', 'Altre {1} offerte per te vicino a {2} che non sono nella tua home, le più recenti prima', '{1} empleos más para ti cerca de {2} que no están en tu inicio, los más recientes primero', 'Mais {1} vagas para você perto de {2} que não estão no seu início, as mais recentes primeiro']],
  [/^(\d+) saved to apply$/, ['{1} gespeichert zum Bewerben', '{1} à postuler', '{1} da candidare', '{1} por postular', '{1} para candidatar']],
  [/^(\d+) this week$/, ['{1} diese Woche', '{1} cette semaine', '{1} questa settimana', '{1} esta semana', '{1} esta semana']],
  [/^(\d+) in progress$/, ['{1} laufend', '{1} en cours', '{1} in corso', '{1} en curso', '{1} em andamento']],
  [/^(\d+) of (\d+) replied$/, ['{1} von {2} haben geantwortet', '{1} sur {2} ont répondu', '{1} su {2} hanno risposto', '{1} de {2} respondieron', '{1} de {2} responderam']],
  [/^(\d+) days ago$/, ['vor {1} Tagen', 'il y a {1} jours', '{1} giorni fa', 'hace {1} días', 'há {1} dias']],
  [/^Saved (today|yesterday|\d+ days ago)$/, ['Gespeichert {1}', 'Enregistrée {1}', 'Salvata {1}', 'Guardado {1}', 'Salva {1}']],
  [/^Applied (today|yesterday|\d+ days ago)$/, ['Beworben {1}', 'Postulée {1}', 'Candidata {1}', 'Postulado {1}', 'Candidatada {1}']],
  [/^(Interview|Offer|Rejected) · (.+)$/, ['{1} · {2}', '{1} · {2}', '{1} · {2}', '{1} · {2}', '{1} · {2}']],
  [/^Actions for (.+)$/, ['Aktionen für {1}', 'Actions pour {1}', 'Azioni per {1}', 'Acciones para {1}', 'Ações para {1}']],
  [/^Stage of (.+)$/, ['Phase von {1}', 'Étape de {1}', 'Fase di {1}', 'Etapa de {1}', 'Etapa de {1}']],
  [/^Good morning, (.+)$/, ['Guten Morgen, {1}', 'Bonjour {1}', 'Buongiorno, {1}', 'Buenos días, {1}', 'Bom dia, {1}']],
  [/^Good afternoon, (.+)$/, ['Guten Tag, {1}', 'Bonjour {1}', 'Buon pomeriggio, {1}', 'Buenas tardes, {1}', 'Boa tarde, {1}']],
  [/^Good evening, (.+)$/, ['Guten Abend, {1}', 'Bonsoir {1}', 'Buonasera, {1}', 'Buenas noches, {1}', 'Boa noite, {1}']],
  [/^(\d+) of (\d+)$/, ['{1} von {2}', '{1} sur {2}', '{1} di {2}', '{1} de {2}', '{1} de {2}']],
  [/^Saved: (.+)$/, ['Gespeichert: {1}', 'Enregistrée : {1}', 'Salvata: {1}', 'Guardado: {1}', 'Salva: {1}']],
  [/^Save (.{4,})$/, ['{1} speichern', 'Enregistrer {1}', 'Salva {1}', 'Guardar {1}', 'Salvar {1}']],
  [/^(\d+) pages?$/, ['{1} Seite(n)', '{1} page(s)', '{1} pagina/e', '{1} página(s)', '{1} página(s)']],
  [/^(\d+) words$/, ['{1} Wörter', '{1} mots', '{1} parole', '{1} palabras', '{1} palavras']],
  [/^(.+) template$/, ['Vorlage {1}', 'Modèle {1}', 'Modello {1}', 'Plantilla {1}', 'Modelo {1}']],
  [/^(.+) · CV$/, ['{1} · Lebenslauf', '{1} · CV', '{1} · CV', '{1} · CV', '{1} · Currículo']],
  [/^(.+) · Cover letter$/, ['{1} · Anschreiben', '{1} · Lettre de motivation', '{1} · Lettera', '{1} · Carta', '{1} · Carta']],
  [/^Start from my CV for (.+)$/, ['Mit meinem Lebenslauf für {1} beginnen', 'Partir de mon CV pour {1}', 'Parti dal mio CV per {1}', 'Empezar con mi CV para {1}', 'Começar com meu currículo para {1}']],
  [/^Searched (.+), the open web and free job boards for your roles, other roles that fit your CV and your strongest skills\. Matched against your CV by job title, skills, location and experience; Vora AI also read the results to find postings the rules missed\.$/, ['Durchsucht: {1}, das offene Web und kostenlose Jobbörsen, für deine Stellen, weitere passende Stellen und deine stärksten Fähigkeiten. Nach Jobtitel, Fähigkeiten, Ort und Erfahrung mit deinem Lebenslauf abgeglichen; Vora KI hat die Ergebnisse zusätzlich gelesen, um Inserate zu finden, die die Regeln übersehen.', 'Recherche sur {1}, le web et les sites gratuits, pour vos postes, d’autres postes adaptés à votre CV et vos points forts. Tri selon le poste, les compétences, le lieu et l’expérience ; l’IA Vora a aussi lu les résultats pour trouver les offres manquées.', 'Cercato su {1}, il web e le bacheche gratuite, per i tuoi ruoli, altri ruoli adatti al CV e le tue competenze migliori. Abbinato per ruolo, competenze, luogo ed esperienza; Vora ha anche letto i risultati per trovare offerte sfuggite.', 'Buscado en {1}, la web y portales gratuitos, para tus puestos, otros que encajan con tu CV y tus mejores habilidades. Comparado por puesto, habilidades, ubicación y experiencia; Vora también leyó los resultados para encontrar ofertas que se escaparon.', 'Busca em {1}, na web e em sites gratuitos, para seus cargos, outros que combinam com seu currículo e suas melhores habilidades. Comparado por cargo, habilidades, local e experiência; a Vora também leu os resultados para achar vagas que escaparam.']],
  [/^usually about (\d+) seconds$/, ['meist etwa {1} Sekunden', 'environ {1} secondes', 'di solito circa {1} secondi', 'suele tardar unos {1} segundos', 'geralmente cerca de {1} segundos']],
  [/^(Reading your CV|Finding each section|Placing every line in the template|Checking nothing is left out|Reading the job posting|Matching your experience to it|Rewriting your CV for this role|Checking the wording|Reading your profile|Choosing what to highlight|Writing your letter|Polishing the wording|Reading your document|Making the change)…$/, ['{1}…', '{1}…', '{1}…', '{1}…', '{1}…']],
  [/^Hi (.+), what should I change in your CV\?$/, ['Hallo {1}, was soll ich an deinem Lebenslauf ändern?', 'Bonjour {1}, que dois-je changer dans votre CV ?', 'Ciao {1}, cosa cambio nel tuo CV?', 'Hola {1}, ¿qué cambio en tu CV?', 'Oi {1}, o que devo mudar no seu currículo?']],
  [/^Hi (.+), what should I change in your cover letter\?$/, ['Hallo {1}, was soll ich an deinem Anschreiben ändern?', 'Bonjour {1}, que dois-je changer dans votre lettre ?', 'Ciao {1}, cosa cambio nella tua lettera?', 'Hola {1}, ¿qué cambio en tu carta?', 'Oi {1}, o que devo mudar na sua carta?']],
  [/^What should I change in your CV\?$/, ['Was soll ich an deinem Lebenslauf ändern?', 'Que dois-je changer dans votre CV ?', 'Cosa cambio nel tuo CV?', '¿Qué cambio en tu CV?', 'O que devo mudar no seu currículo?']],
  [/^What should I change in your cover letter\?$/, ['Was soll ich an deinem Anschreiben ändern?', 'Que dois-je changer dans votre lettre ?', 'Cosa cambio nella tua lettera?', '¿Qué cambio en tu carta?', 'O que devo mudar na sua carta?']],
  [/^Vora only changes this CV\.$/, ['Vora ändert nur diesen Lebenslauf.', 'Vora modifie uniquement ce CV.', 'Vora modifica solo questo CV.', 'Vora solo cambia este CV.', 'A Vora só altera este currículo.']],
  [/^Vora only changes this cover letter\.$/, ['Vora ändert nur dieses Anschreiben.', 'Vora modifie uniquement cette lettre.', 'Vora modifica solo questa lettera.', 'Vora solo cambia esta carta.', 'A Vora só altera esta carta.']],
  [/^Posted (\d+) days ago$/, ['Vor {1} Tagen veröffentlicht', 'Publiée il y a {1} jours', 'Pubblicata {1} giorni fa', 'Publicada hace {1} días', 'Publicada há {1} dias']],
  [/^Posted (\d+) weeks ago$/, ['Vor {1} Wochen veröffentlicht', 'Publiée il y a {1} semaines', 'Pubblicata {1} settimane fa', 'Publicada hace {1} semanas', 'Publicada há {1} semanas']],
  [/^Posted (\d.*|[^\d].{0,12})$/, ['Veröffentlicht am {1}', 'Publiée le {1}', 'Pubblicata il {1}', 'Publicada el {1}', 'Publicada em {1}']],
  [/^Finding more jobs near (.+) that fit your CV…$/, ['Weitere passende Jobs in der Nähe von {1} werden gesucht…', 'Recherche d’autres offres près de {1} qui correspondent à votre CV…', 'Cerco altre offerte vicino a {1} adatte al tuo CV…', 'Buscando más empleos cerca de {1} que encajen con tu CV…', 'Buscando mais vagas perto de {1} que combinam com seu currículo…']],
  [/^(.+) does not let other websites sign you in with your (.+) account\. Instead, paste an API key from their developer site\. Use is billed by (.+) to your own account \(separate from a (.+) app subscription\)\. The key stays in this browser and is only sent to (.+)\.$/, ['{1} erlaubt anderen Websites keine Anmeldung mit deinem {2}-Konto. Füge stattdessen einen API-Schlüssel von deren Entwicklerseite ein. Die Nutzung rechnet {3} über dein eigenes Konto ab (getrennt von einem {4}-Abo). Der Schlüssel bleibt in diesem Browser und geht nur an {5}.', '{1} ne permet pas aux autres sites de vous connecter avec votre compte {2}. Collez plutôt une clé API de leur site développeur. L’usage est facturé par {3} sur votre propre compte (séparé d’un abonnement {4}). La clé reste dans ce navigateur et n’est envoyée qu’à {5}.', '{1} non consente ad altri siti di accedere con il tuo account {2}. Incolla invece una chiave API dal loro sito per sviluppatori. L’uso è fatturato da {3} sul tuo account (separato da un abbonamento {4}). La chiave resta in questo browser ed è inviata solo a {5}.', '{1} no permite que otras webs inicien sesión con tu cuenta de {2}. En su lugar, pega una clave API de su web para desarrolladores. El uso lo cobra {3} en tu propia cuenta (aparte de una suscripción a {4}). La clave se queda en este navegador y solo se envía a {5}.', 'A {1} não permite que outros sites façam login com sua conta {2}. Em vez disso, cole uma chave de API do site de desenvolvedores. O uso é cobrado pela {3} na sua própria conta (separado de uma assinatura {4}). A chave fica neste navegador e só vai para a {5}.']],
  [/^(.+) API key$/, ['{1}-API-Schlüssel', 'Clé API {1}', 'Chiave API {1}', 'Clave API de {1}', 'Chave de API {1}']],
  [/^Get a (.+) API key ↗$/, ['{1}-API-Schlüssel holen ↗', 'Obtenir une clé API {1} ↗', 'Ottieni una chiave API {1} ↗', 'Conseguir una clave API de {1} ↗', 'Obter uma chave de API {1} ↗']],
  [/^Leave empty for (.+)\.$/, ['Leer lassen für {1}.', 'Laisser vide pour {1}.', 'Lascia vuoto per {1}.', 'Déjalo vacío para {1}.', 'Deixe vazio para {1}.']],
  [/^For quick tasks\. Leave empty for (.+)\.$/, ['Für schnelle Aufgaben. Leer lassen für {1}.', 'Pour les tâches rapides. Laisser vide pour {1}.', 'Per attività rapide. Lascia vuoto per {1}.', 'Para tareas rápidas. Déjalo vacío para {1}.', 'Para tarefas rápidas. Deixe vazio para {1}.']],
  [/^(.+) cannot read photos of a CV\. Upload PDF or Word files instead\.$/, ['{1} kann keine Fotos von Lebensläufen lesen. Lade stattdessen PDF- oder Word-Dateien hoch.', '{1} ne lit pas les photos de CV. Importez plutôt des PDF ou des Word.', '{1} non legge foto di CV. Carica invece file PDF o Word.', '{1} no puede leer fotos de un CV. Sube archivos PDF o Word.', '{1} não lê fotos de currículo. Envie arquivos PDF ou Word.']],
  [/^(.+) cannot search the web here, so job search uses the free job boards \(and the Exa connector inside the Claude app\)\.$/, ['{1} kann hier nicht im Web suchen, deshalb nutzt die Jobsuche die kostenlosen Jobbörsen (und in der Claude-App den Exa-Connector).', '{1} ne peut pas chercher sur le web ici : la recherche utilise les sites gratuits (et le connecteur Exa dans l’app Claude).', '{1} non può cercare sul web qui, quindi la ricerca usa le bacheche gratuite (e il connettore Exa nell’app Claude).', '{1} no puede buscar en la web aquí, así que la búsqueda usa los portales gratuitos (y el conector Exa en la app de Claude).', '{1} não pode buscar na web aqui, então a busca usa os sites gratuitos (e o conector Exa no app do Claude).']],
  [/^Talking to (.+)…$/, ['Verbindung zu {1}…', 'Connexion à {1}…', 'Connessione a {1}…', 'Conectando con {1}…', 'Conectando ao {1}…']],
  [/^(.+) is connected\. It replied: (.+)$/, ['{1} ist verbunden. Antwort: {2}', '{1} est connecté. Réponse : {2}', '{1} è collegato. Risposta: {2}', '{1} está conectado. Respuesta: {2}', '{1} está conectado. Resposta: {2}']],
  [/^Paste your (.+) API key first\.$/, ['Füge zuerst deinen {1}-API-Schlüssel ein.', 'Collez d’abord votre clé API {1}.', 'Prima incolla la tua chiave API {1}.', 'Primero pega tu clave API de {1}.', 'Cole primeiro sua chave de API {1}.']],
  [/^Also matching your CV in (.+)$/, ['Ebenfalls passend zu deinem Lebenslauf in {1}', 'Correspondent aussi à votre CV à {1}', 'Adatte al tuo CV anche a {1}', 'También encajan con tu CV en {1}', 'Também combinam com seu currículo em {1}']],
  [/^(\d+) more, not on your home page$/, ['{1} weitere, nicht auf deiner Startseite', '{1} de plus, absentes de votre accueil', 'altre {1}, non nella tua home', '{1} más, no están en tu inicio', 'mais {1}, fora do seu início']],
  [/^See all (\d+)$/, ['Alle {1} anzeigen', 'Voir les {1}', 'Vedi tutte ({1})', 'Ver los {1}', 'Ver todas ({1})']],
  [/^Based on your experience as (.+) · updating…$/, ['Basierend auf deiner Erfahrung als {1} · wird aktualisiert…', 'Selon votre expérience de {1} · mise à jour…', 'In base alla tua esperienza come {1} · aggiornamento…', 'Según tu experiencia como {1} · actualizando…', 'Com base na sua experiência como {1} · atualizando…']],
  [/^Based on your experience as (.+) · updated (.+)$/, ['Basierend auf deiner Erfahrung als {1} · aktualisiert {2}', 'Selon votre expérience de {1} · mis à jour {2}', 'In base alla tua esperienza come {1} · aggiornato {2}', 'Según tu experiencia como {1} · actualizado {2}', 'Com base na sua experiência como {1} · atualizado {2}']],
  [/^(\d+)% match$/, ['{1} % Treffer', '{1} % compatible', '{1}% affinità', '{1} % de encaje', '{1}% compatível']],
  [/^Profile (\d+)% complete$/, ['Profil zu {1} % vollständig', 'Profil complet à {1} %', 'Profilo completo al {1}%', 'Perfil completo al {1} %', 'Perfil {1}% completo']],
  [/^Find your next job, (.+)$/, ['Finde deinen nächsten Job, {1}', 'Trouvez votre prochain emploi, {1}', 'Trova il tuo prossimo lavoro, {1}', 'Encuentra tu próximo empleo, {1}', 'Encontre seu próximo emprego, {1}']],
  [/^Search on job sites in (.+)$/, ['Auf Jobportalen in {1} suchen', 'Chercher sur les sites en {1}', 'Cerca sui siti in {1}', 'Buscar en portales de {1}', 'Buscar em sites de {1}']],
  [/^No site list for "(.+)" yet\. Add the country to see local sites\.$/, ['Noch keine Portalliste für «{1}». Gib das Land an, um lokale Portale zu sehen.', 'Pas encore de liste pour « {1} ». Ajoutez le pays pour voir les sites locaux.', 'Ancora nessun elenco per «{1}». Aggiungi il paese per vedere i siti locali.', 'Aún no hay lista para «{1}». Añade el país para ver portales locales.', 'Ainda não há lista para "{1}". Adicione o país para ver sites locais.']],
  [/^Searching job sites in (.+)…$/, ['Jobportale in {1} werden durchsucht…', 'Recherche sur les sites d’emploi à {1}…', 'Ricerca sui portali a {1}…', 'Buscando en portales de empleo en {1}…', 'Buscando nos sites de vagas em {1}…']],
  [/^Searching job sites in (.+)\. This usually takes under a minute\.$/, ['Jobportale in {1} werden durchsucht. Das dauert meist unter einer Minute.', 'Recherche sur les sites à {1}. Moins d’une minute en général.', 'Ricerca sui siti a {1}. Di solito meno di un minuto.', 'Buscando en portales de {1}. Suele tardar menos de un minuto.', 'Buscando em sites de {1}. Costuma levar menos de um minuto.']],
  [/^Searching job sites\. This usually takes under a minute\.$/, ['Jobportale werden durchsucht. Das dauert meist unter einer Minute.', 'Recherche sur les sites. Moins d’une minute en général.', 'Ricerca sui siti. Di solito meno di un minuto.', 'Buscando en portales. Suele tardar menos de un minuto.', 'Buscando em sites. Costuma levar menos de um minuto.']],
  [/^(\d+) jobs? from (\d+) sites, best match first(.*)$/, ['{1} Jobs von {2} Portalen, beste Treffer zuerst{3}', '{1} offres de {2} sites, meilleures d’abord{3}', '{1} offerte da {2} siti, migliori prima{3}', '{1} empleos de {2} portales, mejores primero{3}', '{1} vagas de {2} sites, melhores primeiro{3}']],
  [/^(\d+) jobs? from (\d+) sites, newest first(.*)$/, ['{1} Jobs von {2} Portalen, neueste zuerst{3}', '{1} offres de {2} sites, les plus récentes d’abord{3}', '{1} offerte da {2} siti, le più recenti prima{3}', '{1} empleos de {2} portales, los más recientes primero{3}', '{1} vagas de {2} sites, mais recentes primeiro{3}']],
  [/^(\d+) jobs?, newest first(.*)$/, ['{1} Jobs, neueste zuerst{2}', '{1} offres, les plus récentes d’abord{2}', '{1} offerte, le più recenti prima{2}', '{1} empleos, los más recientes primero{2}', '{1} vagas, mais recentes primeiro{2}']],
  [/^(\d+) jobs? from (\d+) sites(.*)$/, ['{1} Jobs von {2} Portalen{3}', '{1} offres de {2} sites{3}', '{1} offerte da {2} siti{3}', '{1} empleos de {2} portales{3}', '{1} vagas de {2} sites{3}']],
  [/^(\d+) jobs?, best match first(.*)$/, ['{1} Jobs, beste Treffer zuerst{2}', '{1} offres, meilleures d’abord{2}', '{1} offerte, migliori prima{2}', '{1} empleos, mejores primero{2}', '{1} vagas, melhores primeiro{2}']],
  [/^(\d+) jobs?(.*)$/, ['{1} Jobs{2}', '{1} offres{2}', '{1} offerte{2}', '{1} empleos{2}', '{1} vagas{2}']],
  [/^(.+) unavailable$/, ['{1} nicht erreichbar', '{1} indisponible', '{1} non disponibile', '{1} no disponible', '{1} indisponível']],
  [/^Applied (.+)$/, ['Beworben {1}', 'Postulé le {1}', 'Candidato il {1}', 'Enviada el {1}', 'Enviada em {1}']],
  [/^Saved (.+)$/, ['Gespeichert {1}', 'Enregistré le {1}', 'Salvato il {1}', 'Guardado el {1}', 'Salvo em {1}']],
  [/^Moved to (.+)$/, ['Verschoben nach {1}', 'Déplacé vers {1}', 'Spostato in {1}', 'Movido a {1}', 'Movido para {1}']],
  [/^About (.+)$/, ['Über {1}', 'À propos de {1}', 'Informazioni su {1}', 'Sobre {1}', 'Sobre {1}']],
  [/^From (.+?) and (\d+) more · checked (.+)$/, ['Aus {1} und {2} weiteren · geprüft {3}', 'Source : {1} et {2} autres · vérifié le {3}', 'Da {1} e altri {2} · controllato il {3}', 'De {1} y {2} más · revisado el {3}', 'De {1} e mais {2} · verificado em {3}']],
  [/^From (.+) · checked (.+)$/, ['Aus {1} · geprüft {2}', 'Source : {1} · vérifié le {2}', 'Da {1} · controllato il {2}', 'De {1} · revisado el {2}', 'De {1} · verificado em {2}']],
  [/^From a web search · checked (.+)$/, ['Aus einer Websuche · geprüft {1}', 'Recherche web · vérifié le {1}', 'Ricerca web · controllato il {1}', 'Búsqueda web · revisado el {1}', 'Busca na web · verificado em {1}']],
  [/^Looking up (.+): website, size, news and employee reviews…$/, ['{1} wird nachgeschlagen: Website, Grösse, News und Bewertungen…', 'Recherche sur {1} : site, taille, actualités et avis…', 'Ricerca su {1}: sito, dimensioni, notizie e recensioni…', 'Buscando {1}: web, tamaño, noticias y opiniones…', 'Pesquisando {1}: site, porte, notícias e avaliações…']],
  [/^Download PDF · (.+)$/, ['PDF herunterladen · {1}', 'Télécharger le PDF · {1}', 'Scarica PDF · {1}', 'Descargar PDF · {1}', 'Baixar PDF · {1}']],
  [/^(.+) template, matching your CV · (\d+) words · updated (.+)$/, ['Vorlage {1}, wie dein Lebenslauf · {2} Wörter · aktualisiert {3}', 'Modèle {1}, comme votre CV · {2} mots · mis à jour le {3}', 'Modello {1}, come il tuo CV · {2} parole · aggiornato il {3}', 'Plantilla {1}, como tu CV · {2} palabras · actualizada el {3}', 'Modelo {1}, igual ao currículo · {2} palavras · atualizado em {3}']],
  [/^(.+) template · (\d+) words · updated (.+)$/, ['Vorlage {1} · {2} Wörter · aktualisiert {3}', 'Modèle {1} · {2} mots · mis à jour le {3}', 'Modello {1} · {2} parole · aggiornato il {3}', 'Plantilla {1} · {2} palabras · actualizada el {3}', 'Modelo {1} · {2} palavras · atualizado em {3}']],
  [/^(.+) template · updated (.+)$/, ['Vorlage {1} · aktualisiert {2}', 'Modèle {1} · mis à jour le {2}', 'Modello {1} · aggiornato il {2}', 'Plantilla {1} · actualizada el {2}', 'Modelo {1} · atualizado em {2}']],
  [/^(.+) template$/, ['Vorlage {1}', 'Modèle {1}', 'Modello {1}', 'Plantilla {1}', 'Modelo {1}']],
  [/^Colour (#[0-9a-f]{6})$/i, ['Farbe {1}', 'Couleur {1}', 'Colore {1}', 'Color {1}', 'Cor {1}']],
  [/^Use my CV's template \((.+)\)$/, ['Vorlage meines Lebenslaufs nutzen ({1})', 'Utiliser le modèle de mon CV ({1})', 'Usa il modello del mio CV ({1})', 'Usar la plantilla de mi CV ({1})', 'Usar o modelo do meu currículo ({1})']],
  [/^via (.+)$/, ['über {1}', 'via {1}', 'tramite {1}', 'vía {1}', 'via {1}']],
  [/^Remove (.+)$/, ['{1} entfernen', 'Retirer {1}', 'Rimuovi {1}', 'Quitar {1}', 'Remover {1}']],
  [/^Edit (name|headline|location|email|phone)$/, ['{1} bearbeiten', 'Modifier : {1}', 'Modifica {1}', 'Editar {1}', 'Editar {1}']],
  [/^\+ (Add .+)$/, ['+ {1}', '+ {1}', '+ {1}', '+ {1}', '+ {1}']],
  [/^(\d+) words$/, ['{1} Wörter', '{1} mots', '{1} parole', '{1} palabras', '{1} palavras']],
  [/^Current file: (.+)$/, ['Aktuelle Datei: {1}', 'Fichier actuel : {1}', 'File attuale: {1}', 'Archivo actual: {1}', 'Arquivo atual: {1}']],
  [/^Reading (.+)…$/, ['{1} wird gelesen…', 'Lecture de {1}…', 'Lettura di {1}…', 'Leyendo {1}…', 'Lendo {1}…']],
  [/^Read (.+) \((\d+) words\)\. Check the CV text below and fix anything that came out wrong\.$/, ['{1} gelesen ({2} Wörter). Prüfe den Text unten und korrigiere, was falsch ist.', '{1} lu ({2} mots). Vérifiez le texte ci-dessous et corrigez les erreurs.', '{1} letto ({2} parole). Controlla il testo qui sotto e correggi gli errori.', '{1} leído ({2} palabras). Revisa el texto de abajo y corrige lo que salió mal.', '{1} lido ({2} palavras). Confira o texto abaixo e corrija o que saiu errado.']],
  [/^(.+) is an image or a scan, so Claude will read it\.$/, ['{1} ist ein Bild oder Scan, deshalb liest Claude es.', '{1} est une image ou un scan : Claude va le lire.', '{1} è un’immagine o una scansione, quindi lo leggerà Claude.', '{1} es una imagen o un escaneo, así que lo leerá Claude.', '{1} é uma imagem ou digitalização, então o Claude vai ler.']],
  [/^CV score (\d+) out of 100$/, ['Lebenslauf-Note {1} von 100', 'Note du CV {1} sur 100', 'Punteggio CV {1} su 100', 'Puntuación del CV {1} de 100', 'Nota do currículo {1} de 100']],
  [/^Reviewed (.+)$/, ['Geprüft {1}', 'Évalué le {1}', 'Valutato il {1}', 'Revisado el {1}', 'Avaliado em {1}']],
  [/^(.+) · score (\d+)\/100$/, ['{1} · Note {2}/100', '{1} · note {2}/100', '{1} · punteggio {2}/100', '{1} · puntuación {2}/100', '{1} · nota {2}/100']],
  [/^(.+) · not reviewed yet$/, ['{1} · noch nicht geprüft', '{1} · pas encore évalué', '{1} · non ancora valutato', '{1} · aún sin revisar', '{1} · ainda não avaliado']],
  [/^(\d) of 5 filled$/, ['{1} von 5 ausgefüllt', '{1} sur 5 remplis', '{1} su 5 compilati', '{1} de 5 completados', '{1} de 5 preenchidos']],
  [/^(\d+) skills · (\d+) languages$/, ['{1} Fähigkeiten · {2} Sprachen', '{1} compétences · {2} langues', '{1} competenze · {2} lingue', '{1} habilidades · {2} idiomas', '{1} habilidades · {2} idiomas']],
  [/^Signed in as (.+)\. Your profile, applications and documents sync to your account\.$/, ['Angemeldet als {1}. Profil, Bewerbungen und Dokumente werden mit deinem Konto synchronisiert.', 'Connecté en tant que {1}. Profil, candidatures et documents sont synchronisés.', 'Accesso come {1}. Profilo, candidature e documenti si sincronizzano con l’account.', 'Sesión iniciada como {1}. Perfil, candidaturas y documentos se sincronizan con tu cuenta.', 'Conectado como {1}. Perfil, candidaturas e documentos sincronizam com sua conta.']],
  [/^Signed in\. Your profile, applications and documents sync to your account\.$/, ['Angemeldet. Profil, Bewerbungen und Dokumente werden mit deinem Konto synchronisiert.', 'Connecté. Profil, candidatures et documents sont synchronisés.', 'Accesso eseguito. Profilo, candidature e documenti si sincronizzano.', 'Sesión iniciada. Perfil, candidaturas y documentos se sincronizan.', 'Conectado. Perfil, candidaturas e documentos sincronizam.']],
  [/^Synced (.+)$/, ['Synchronisiert {1}', 'Synchronisé {1}', 'Sincronizzato {1}', 'Sincronizado {1}', 'Sincronizado {1}']],
  [/^Your account, (.+)$/, ['Dein Konto, {1}', 'Votre compte, {1}', 'Il tuo account, {1}', 'Tu cuenta, {1}', 'Sua conta, {1}']],
  [/^8 question cards for (.+?)( at (.+))?\. Answer out loud or type, get stars and a better version of your answer, and see how ready you are\.$/, ['8 Fragekarten für {1}. Antworte laut oder tippe, sammle Sterne, bekomm eine bessere Version deiner Antwort und sieh, wie bereit du bist.', '8 cartes de questions pour {1}. Répondez à voix haute ou par écrit, gagnez des étoiles, obtenez une meilleure version et voyez où vous en êtes.', '8 carte di domande per {1}. Rispondi a voce o per iscritto, guadagna stelle, ottieni una versione migliore e scopri quanto sei pronto.', '8 cartas de preguntas para {1}. Responde en voz alta o escribiendo, gana estrellas, recibe una versión mejor y mira cuánto estás preparado.', '8 cartas de perguntas para {1}. Responda em voz alta ou digitando, ganhe estrelas, receba uma versão melhor e veja o quanto está pronto.']],
  [/^Card (\d+) of (\d+)$/, ['Karte {1} von {2}', 'Carte {1} sur {2}', 'Carta {1} di {2}', 'Carta {1} de {2}', 'Carta {1} de {2}']],
  [/^Streak ×(\d+)$/, ['Serie ×{1}', 'Série ×{1}', 'Serie ×{1}', 'Racha ×{1}', 'Sequência ×{1}']],
  [/^Hint \(−(\d+) XP\)$/, ['Tipp (−{1} XP)', 'Indice (−{1} XP)', 'Suggerimento (−{1} XP)', 'Pista (−{1} XP)', 'Dica (−{1} XP)']],
  [/^Difficulty (\d) of 3$/, ['Schwierigkeit {1} von 3', 'Difficulté {1} sur 3', 'Difficoltà {1} su 3', 'Dificultad {1} de 3', 'Dificuldade {1} de 3']],
  [/^They want to know: (.+)$/, ['Sie wollen wissen: {1}', 'Ils veulent savoir : {1}', 'Vogliono sapere: {1}', 'Quieren saber: {1}', 'Eles querem saber: {1}']],
  [/^(\d) out of 5 stars$/, ['{1} von 5 Sternen', '{1} étoiles sur 5', '{1} stelle su 5', '{1} de 5 estrellas', '{1} de 5 estrelas']],
  [/^Replay (\d+) weaker cards?$/, ['{1} schwächere Karten wiederholen', 'Rejouer {1} cartes plus faibles', 'Rigioca {1} carte più deboli', 'Repetir {1} cartas más flojas', 'Repetir {1} cartas mais fracas']],
  [/^Your best run: (\d+) XP$/, ['Dein bester Lauf: {1} XP', 'Votre meilleur score : {1} XP', 'Il tuo record: {1} XP', 'Tu mejor ronda: {1} XP', 'Sua melhor rodada: {1} XP']],
  [/^per star, up to 5 stars a card$/, ['pro Stern, bis zu 5 Sterne pro Karte', 'par étoile, jusqu’à 5 étoiles par carte', 'per stella, fino a 5 stelle a carta', 'por estrella, hasta 5 por carta', 'por estrela, até 5 por carta']],
  [/^streak bonus for back-to-back 4 star answers$/, ['Serienbonus für mehrere 4-Sterne-Antworten in Folge', 'bonus de série pour des réponses 4 étoiles d’affilée', 'bonus serie per risposte da 4 stelle di fila', 'bonus de racha por respuestas de 4 estrellas seguidas', 'bônus de sequência por respostas de 4 estrelas seguidas']],
  [/^to peek at a hint$/, ['für einen Tipp', 'pour voir un indice', 'per un suggerimento', 'para ver una pista', 'para ver uma dica']],
  [/^Search failed: (.+)$/, ['Suche fehlgeschlagen: {1}', 'Échec de la recherche : {1}', 'Ricerca non riuscita: {1}', 'La búsqueda falló: {1}', 'A busca falhou: {1}']],
  [/^Searching (\d+) job portals in (.+)…$/, ['{1} Jobportale in {2} werden durchsucht…', 'Recherche sur {1} sites à {2}…', 'Ricerca su {1} portali a {2}…', 'Buscando en {1} portales de {2}…', 'Buscando em {1} portais de {2}…']],
  [/^Searching job portals in (.+)…$/, ['Jobportale in {1} werden durchsucht…', 'Recherche sur les sites à {1}…', 'Ricerca sui portali a {1}…', 'Buscando en portales de {1}…', 'Buscando em portais de {1}…']],
];

// Formats used when the app builds a sentence itself (job-match reasons).
const FORMATS = {
  'you have {1}': ['du hast {1}', 'vous maîtrisez {1}', 'hai {1}', 'tienes {1}', 'você tem {1}'],
  'in {1}': ['in {1}', 'à {1}', 'a {1}', 'en {1}', 'em {1}'],
  'fits your {1} years': ['passt zu deinen {1} Jahren', 'correspond à vos {1} ans', 'adatto ai tuoi {1} anni', 'encaja con tus {1} años', 'combina com seus {1} anos'],
  'fits your level': ['passt zu deinem Niveau', 'correspond à votre niveau', 'adatto al tuo livello', 'encaja con tu nivel', 'combina com seu nível'],
  'asks for {1}': ['verlangt {1}', 'demande {1}', 'richiede {1}', 'pide {1}', 'pede {1}'],
  'aimed at {1} level': ['für {1}-Niveau', 'niveau {1} visé', 'per livello {1}', 'pensado para nivel {1}', 'voltada para nível {1}'],
  'needs {1}': ['braucht {1}', 'exige {1}', 'richiede {1}', 'requiere {1}', 'exige {1}'],
  '{1} but {2}': ['{1}, aber {2}', '{1}, mais {2}', '{1}, ma {2}', '{1}, pero {2}', '{1}, mas {2}'],
  'English': ['Englisch', 'anglais', 'inglese', 'inglés', 'inglês'],
  'German': ['Deutsch', 'allemand', 'tedesco', 'alemán', 'alemão'],
  'French': ['Französisch', 'français', 'francese', 'francés', 'francês'],
  'Italian': ['Italienisch', 'italien', 'italiano', 'italiano', 'italiano'],
  'Spanish': ['Spanisch', 'espagnol', 'spagnolo', 'español', 'espanhol'],
  'Portuguese': ['Portugiesisch', 'portugais', 'portoghese', 'portugués', 'português'],
  'Dutch': ['Niederländisch', 'néerlandais', 'olandese', 'neerlandés', 'holandês'],
};

// ---------------------------------------------------------------------------

let lang = 'en';
const cache = new Map();

export const currentLanguage = () => lang;
export const locale = () => LANGUAGES.find((l) => l.code === lang)?.locale || 'en-GB';
export const languageName = (code = lang) => ({ en: 'English', de: 'German', fr: 'French', it: 'Italian', es: 'Spanish', pt: 'Portuguese' })[code] || 'English';

// English country names (as the portal list spells them) -> the name in the current language.
let regions = null;
function regionName(name) {
  try {
    if (!regions) {
      regions = new Map();
      const en = new Intl.DisplayNames(['en'], { type: 'region' });
      for (let a = 65; a <= 90; a++)
        for (let b = 65; b <= 90; b++) {
          const code = String.fromCharCode(a, b);
          const n = en.of(code);
          if (n && n !== code) regions.set(n, code);
        }
    }
    const code = regions.get(name);
    return code ? new Intl.DisplayNames([locale()], { type: 'region' }).of(code) : null;
  } catch {
    return null;
  }
}

function lookup(core) {
  const col = COL[lang];
  const row = DICT[core];
  if (row) return row[col];
  for (const [re, rows] of PATTERNS) {
    const m = core.match(re);
    if (m) return rows[col].replace(/\{(\d)\}/g, (_, n) => (m[n] === undefined ? '' : (lookup(m[n]) ?? regionName(m[n]) ?? m[n])));
  }
  return null;
}

/** Translate one English UI text into the current language (unknown texts pass through). */
export function t(text) {
  if (!text || (lang === 'en' && !brand)) return text;
  const key = String(text);
  if (cache.has(key)) return cache.get(key);
  let res = key;
  if (lang !== 'en') {
    const m = key.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const out = m[2] && m[2].length < 600 ? lookup(m[2]) : null;
    if (out != null) res = m[1] + out + m[3];
  }
  if (brand && !REAL_CLAUDE.test(key)) res = withBrand(res);
  cache.set(key, res);
  return res;
}

// The AI is called Vora in the interface ("Vora is writing…"), whichever
// model powers it. The Claude app, Claude account and Claude model names keep
// their name, and so do the texts about allowing this page to use Claude.
const REAL_CLAUDE = /Allow (?:this page|web search)[^.]*Claude|use Claude when asked/;
let brand = '';
const KEEP = /^(?:\s|-)*(?:app|account|session|Opus|Sonnet|Haiku|App|Konto|-App|-Konto)\b|^\.ai|^'s (?:app|account)/;
function withBrand(text) {
  return text.replace(/\bClaude(?:s)?\b/g, (word, i) => (KEEP.test(text.slice(i + word.length)) || /(your|dein|deinem|votre|tuo|tu|sua|seu|eigenen|own|by)\s+$/i.test(text.slice(0, i)) ? word : word.replace('Claude', brand)));
}
/** Name the AI that does the work in interface texts ('' = Claude). */
export function setBrand(name) {
  const next = name && name !== 'Claude' ? name : '';
  if (next === brand) return;
  brand = next;
  cache.clear();
  if (observer) retranslate();
}

/** Fill an English format like "you have {1}" in the current language. */
export function fmt(format, ...args) {
  const row = lang === 'en' ? null : FORMATS[format];
  const base = row ? row[COL[lang]] : format;
  return base.replace(/\{(\d)\}/g, (_, n) => args[n - 1] ?? '');
}
/** A word from FORMATS or DICT (language names, levels…). */
export function word(w) {
  if (lang === 'en') return w;
  return FORMATS[w]?.[COL[lang]] ?? DICT[w]?.[COL[lang]] ?? w;
}

// ---------------------------------------------------------------------------
// Page translator
// ---------------------------------------------------------------------------

const SKIP = '.cv-page, .description, textarea, pre, code, script, style, [translate="no"], .ai-output.doc';
const ATTRS = ['placeholder', 'aria-label', 'title'];
const seen = new WeakMap(); // node -> { src, out } (attributes: element -> { [attr]: { src, out } })

function skipped(el) {
  // The add/remove buttons on an editable page are interface, not document text.
  if (el?.closest?.('.ed-ctl')) return false;
  return Boolean(el?.closest?.(SKIP));
}

function doText(node) {
  if (skipped(node.parentElement)) return;
  const cur = node.nodeValue;
  if (!cur || !/[A-Za-z]/.test(cur)) return;
  const rec = seen.get(node);
  if (rec && cur === rec.out) return; // already ours
  const out = t(cur);
  seen.set(node, { src: cur, out });
  if (out !== cur) node.nodeValue = out;
}

const ATTR_SKIP = '.cv-page, .description, pre, code, [translate="no"]';
function doAttrs(el) {
  if (el.closest?.(ATTR_SKIP) && !el.classList?.contains('ed-ctl')) return;
  let recs = seen.get(el);
  for (const a of ATTRS) {
    const cur = el.getAttribute(a);
    if (!cur) continue;
    const rec = recs?.[a];
    if (rec && cur === rec.out) continue;
    const out = t(cur);
    recs = recs || {};
    recs[a] = { src: cur, out };
    if (out !== cur) el.setAttribute(a, out);
  }
  if (recs) seen.set(el, recs);
}

function walk(root) {
  if (root.nodeType === 3) return doText(root);
  if (root.nodeType !== 1) return;
  doAttrs(root);
  if (skipped(root)) return;
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => {
      if (n.nodeType === 1 && n.matches(SKIP)) {
        doAttrs(n); // e.g. a textarea's placeholder
        for (const c of n.querySelectorAll?.('.ed-ctl') || []) {
          doAttrs(c);
          c.childNodes.forEach((x) => x.nodeType === 3 && doText(x));
        }
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = it.nextNode(); n; n = it.nextNode()) (n.nodeType === 3 ? doText(n) : doAttrs(n));
}

let observer = null;
function observe() {
  observer = new MutationObserver((list) => {
    observer.disconnect();
    for (const m of list) {
      if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doAttrs(m.target);
      else m.addedNodes.forEach(walk);
    }
    connect();
  });
  connect();
}
function connect() {
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

/** Restore the English texts this translator replaced, then translate everything again. */
function retranslate() {
  observer?.disconnect();
  const it = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    const rec = seen.get(n);
    if (!rec) continue;
    if (n.nodeType === 3) {
      if (n.nodeValue === rec.out) n.nodeValue = rec.src;
    } else {
      for (const [a, r] of Object.entries(rec)) if (n.getAttribute(a) === r.out) n.setAttribute(a, r.src);
    }
    seen.delete(n);
  }
  walk(document.body);
  if (observer) connect();
}

/** Switch the interface language. */
export function setLanguage(code) {
  const next = LANGUAGES.some((l) => l.code === code) ? code : 'en';
  if (next === lang && observer) return;
  lang = next;
  cache.clear();
  document.documentElement.lang = lang;
  if (!observer) {
    walk(document.body);
    observe();
  } else retranslate();
}
