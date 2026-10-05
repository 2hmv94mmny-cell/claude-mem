import { about, business, faq, hours, nav, sampleTicket, services, steps } from "@/content";

export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="wrap header-row">
          <a className="brand" href="#top">
            {business.shortName}
            <span className="brand-sub">Cycle Works</span>
          </a>
          <nav aria-label="Main">
            <ul className="nav-list">
              {nav.map((item) => (
                <li key={item.href}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="hero wrap">
          <div className="hero-copy">
            <p className="eyebrow">{business.address[1].split(" ").slice(1).join(" ")} workshop</p>
            <h1>{business.tagline}</h1>
            <p className="lead">{business.intro}</p>
            <div className="actions">
              <a className="button button-primary" href="#visit">
                Plan your drop-off
              </a>
              <a className="button button-ghost" href="#services">
                See prices
              </a>
            </div>
          </div>

          <aside className="ticket" aria-label="Example job ticket">
            <div className="ticket-head">
              <span>{sampleTicket.job}</span>
              <span>{sampleTicket.bike}</span>
            </div>
            <dl className="ticket-lines">
              {sampleTicket.lines.map((line) => (
                <div key={line.label}>
                  <dt>{line.label}</dt>
                  <dd>{line.value}</dd>
                </div>
              ))}
            </dl>
            <div className="ticket-foot">
              <span className="stamp">Checked twice</span>
              <span>{sampleTicket.status}</span>
            </div>
          </aside>
        </section>

        <section id="services" className="section wrap">
          <div className="section-head">
            <h2>Services and prices</h2>
            <p>Fixed prices including labour. Parts are quoted before we fit them.</p>
          </div>
          <ul className="price-list">
            {services.map((s) => (
              <li key={s.name}>
                <div className="price-row">
                  <h3>{s.name}</h3>
                  <span className="leader" aria-hidden="true" />
                  <span className="price">{s.price}</span>
                </div>
                <p>{s.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="how" className="section band">
          <div className="wrap">
            <div className="section-head">
              <h2>How a same-day service works</h2>
            </div>
            <ol className="steps">
              {steps.map((step, i) => (
                <li key={step.title}>
                  <span className="step-num">{String(i + 1).padStart(2, "0")}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="about" className="section wrap about">
          <div className="about-copy">
            <h2>{about.heading}</h2>
            {about.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <dl className="facts">
            {about.facts.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="visit" className="section wrap visit">
          <div>
            <h2>Visit the workshop</h2>
            <address>
              {business.address.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </address>
            <p className="contact-line">
              Phone <span className="mono">{business.phone}</span>
            </p>
            <p className="contact-line">
              Email <span className="mono">{business.email}</span>
            </p>
          </div>
          <div>
            <h3 className="sub-head">Opening hours</h3>
            <table className="hours">
              <tbody>
                {hours.map((h) => (
                  <tr key={h.day}>
                    <th scope="row">{h.day}</th>
                    <td>{h.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="faq">
            <h3 className="sub-head">Questions</h3>
            {faq.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap footer-row">
          <span>
            © {new Date().getFullYear()} {business.name}
          </span>
          <span>{business.address.join(", ")}</span>
        </div>
      </footer>
    </>
  );
}
