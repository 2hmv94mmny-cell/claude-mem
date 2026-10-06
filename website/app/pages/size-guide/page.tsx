import type { Metadata } from "next";
import { TextPageLayout } from "@/components/TextPageLayout";
import { sizeChart } from "@/content";

export const metadata: Metadata = { title: "Size Guide" };

function SizeTable({ head, rows, caption }: { head: string[]; rows: string[][]; caption: string }) {
  return (
    <div className="table-wrap">
      <table className="size-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, i) => (i === 0 ? <th key={i} scope="row">{cell}</th> : <td key={i}>{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SizeGuidePage() {
  return (
    <TextPageLayout current="size-guide" title="Size Guide">
      <section>
        <p>
          All measurements are body measurements in centimetres. If you are between two sizes, we recommend the
          larger size for outerwear and knitwear.
        </p>
      </section>
      <section>
        <h2>Ready-to-wear</h2>
        <SizeTable caption="Clothing sizes" {...sizeChart.clothing} />
      </section>
      <section>
        <h2>Kids</h2>
        <SizeTable caption="Kids sizes, height and chest in cm" {...sizeChart.kids} />
      </section>
      <section>
        <h2>Shoes</h2>
        <SizeTable caption="Shoe sizes, foot length in cm" {...sizeChart.shoes} />
      </section>
      <section>
        <h2>How to measure</h2>
        <p>Bust: around the fullest part of your chest. Waist: around your natural waistline. Hips: around the fullest part of your hips.</p>
        <p>Foot length: stand on a sheet of paper, mark your heel and longest toe, and measure the distance between them.</p>
      </section>
    </TextPageLayout>
  );
}
