## User perspective

Who are users:
    - Researchers
    - Civil Society

I want to know:
    - Am I eligible? -> filter immediately
    - Until when can I apply?
    - How much money would I get?
    - Where do I apply?

- **FundingOpportunity** as entry points for people looking for funding in **Germany**
- why? collection of all state funding in germany -> FDB should already cover this (incl. EU)
    - EUFT could potentially be more accurate on EU side, but not proven if FSB misses funding opportunity
    - DSEE extends funding opportunities to non state funders (foundations etc.)
    - overlap between FDB, EUFT and DSEE 

- what is target audience? funding instrument and area depends on audience/eligible entity. 
    - NPOs
    - Research Institutions -> non-profit? what about for-profit institutes? filter problem
    - Companies/Start-Ups
- Grant based funding only? deadline etc depends on funding instrument
- nested/conditional areas -> e.g. if research institue use some standardized system of research areas, if NPO use SDGs?, if company use standardized system of economic activities
- we'd need to filter sources if we e.g. only want to include NPOs


## Existing schemas 

### XFoerderleistungsbeschreibung (XFB)

Source: https://www.xrepository.de/api/xrepository/urn:xoev-de:kosit:standard:xflb_2.0.0:dokument:XFLB_2.0.0_Spezifikation

- https://foerderfinder.digital/bayern/suche is based on this already



- "Eine **Förderung** ist eine staatliche finanzielle Leistung"
- "**Förderrichtlinien** sind dokumentierte Anweisungen oder Regeln, die festlegen, wie ein Förderprogramm oder eine Förderinitiative umgesetzt wird"
- "Ein **Förderprogramm** besteht aus mehreren anhand der Voraussetzungen differenzierbaren Förderleistungen (auch Bekanntmachungen). Letztere entstammen alle derselben Rechtsgrundlage (Richtlinie) und hängen somit bei der Umsetzung inhaltlich, thematisch und organisatorisch zusammen."
- "Eine **Förderleistung** beschreibt den spezifischen Fördergegenstand, Ziele und Voraussetzungen für die beantragbaren Fördermittel"

#### Relevant Fields

- title


## Förderdatenbank DSEE

Source: https://foerderdatenbank.d-s-e-e.de

### Relevant fields

- Title
- Beschreibung
- Fördergeber
- Regionen
- Engagementbereiche ( Umwelt-/Naturschutz, Klimaschutz und Tierschutz)
- Förderfähige Kosten (Bau- und Investkosten, Sachkosten)
- Max. Fördersumme (1.500€)
- Bewerbungsfrist (Datum)/Fortlaufende Förderung 
- Vorzeitiger Maßnahmebeginn (bool, ja nein)

## Schema.org FundingScheme

A FundingScheme combines organizational, project and policy aspects of grant-based funding that sets guidelines, principles and mechanisms to support other kinds of projects and activities. Funding is typically organized via Grant funding. 

### Relevant fields

- funder
- email

## EU Funding & Tenders Portal (EUFT)

Call vs Topic

### Relevant Fields

- title
- descriptionByte

## Förderdatenbank Bund (FDB)

Source: https://www.foerderdatenbank.de/SiteGlobals/FDB/Forms/Suche/Expertensuche_Formular.html?resourceId=c4b4dbf3-4c29-4e70-9465-1f1783a8f117&input_=bd101467-e52a-4850-931d-5e2a691629e5&pageLocale=de&filterCategories=FundingProgram&filterCategories.GROUP=1&templateQueryString=&submit=Suchen

### Relevant fields 

- 

## Fördermittelkompass API (FMK)

Source: https://foerdermittelkompass.reflecta.org/helpcenter/api/fields


## Draft: FundingOpportunity

- An offer by a funding organization (state or non-state) that wants to further some cause (categorized by funding area, dependent on eligible entity) via a recipient (private person or organisation (company, NPO, research institute )) with a financial funding instrument (grant or other)

### Fields
- title (short text)
- description (long text)
- areas (array, because some sources use arrays here)
    - Areas relatively dependent on eligible entities: there are differences between areas of research, company and civic society funding
    - Candidates:
        - **FDB** (Förderbereich): Arbeit, Aus- & Weiterbildung, Außenwirtschaft, Beratung, Corona-Hilfe, Digitalisierung, Energieeffizienz & Erneuerbare Energien, Existenzgründung & -festigung, Forschung & Innovation (themenoffen), Forschung & Innovation (themenspezifisch), Frauenförderung, Gesundheit & Soziales, Infrastruktur, Kultur, Medien & Sport, Landwirtschaft & Ländliche Entwicklung, Messen & Ausstellungen, Mobilität, Regionalförderung, Smart Cities & Regionen, Städtebau & Stadterneuerung, Umwelt- & Naturschutz, Unternehmensfinanzierung, Wohnungsbau & Modernisierung
        - **XFB/FF** (Förderbereich): Gesundheit und Soziales, Kultur Medien und Sport, Aus und Weiterbildung, Infrastruktur, Regionalförderung, Digitalisierung, Integration, Beratung, Forschung und Innovation (themenspezifisch), Umwelt- und Naturschutz, Wohnungsbau und Modernisierung, Arbeit, Energieeffizienz und Erneuerbare Energien, Existenzgründung und -festigung, Forschung und Innovation (themenoffen), Landwirtschaft und Ländliche Entwicklung, Messen und Ausstellungen, Smart Cities und Regionen, Städtebau und Stadterneuerung, Unternehmensfinanzierung
        - **DSEE** (Engagementbereich): Bauten und Denkmalschutz, Bevölkerungs- und Katastrophenschutz, Bildung, Bildung für nachhaltige Entwicklung, Digitalisierung, Engagement für gesellschaftlichen Zusammenhalt/Demokratie, Entwicklungszusammenarbeit, Kinder und Jugendliche, Kultur, Medien und Musik, Migration, Soziales, Sport und Bewegung, Umwelt-/Naturschutz, Klimaschutz und Tierschutz, Wissenschaft und Forschung, Sonstiges
        - **EUFT** (destination): 172 values
        - FMK: grant_areas
- region
    - **FDB** (Fördergebiet): bundesweit, Baden-Württemberg, Bayern, Berlin, Brandenburg, Bremen, Niedersachsen, Sachsen-Anhalt, Hamburg, Hessen, Mecklenburg-Vorpommern, Nordrhein-Westfalen, Rheinland-Pfalz, Saarland, Sachsen, Schleswig-Holstein, Sonstige, Thüringen
    - **XFB/FF** (Fördergebiet): Baden-Württemberg, Bayern, Berlin, Brandenburg, Bremen, Hamburg, Hessen, Mecklenburg-Vorpommern, Niedersachsen, Nordrhein-Westfalen, Rheinland-Pfalz, Saarland, Sachsen, Sachsen-Anhalt, Schleswig-Holstein, Thüringen 
    - **DSEE** (Bundesland): Baden-Württemberg, Bayern, Berlin, Brandenburg, Bremen, Hamburg, Hessen, Mecklenburg-Vorpommern, Niedersachsen, Nordrhein-Westfalen, Rheinland-Pfalz, Saarland, Sachsen, Sachsen-Anhalt, Schleswig-Holstein, Thüringen, Bundesweit
    - **EUFT** tbd
    - FMK: regions

- eligible
    - FDB: Educational institution, entrepreneur, research institution, college or university, municipality, public institution, private individual, company, association/organization
    - XFB/FF: Authorities/Municipalities, Associations/Organizations, Foundations, Private Individuals, Companies, Research Institutions, Freelancers, Volunteers
    - DSEE: X
    - EUFT: X
    - FMK: eligible_entities



### General Candidates

- regions (FMK)
- grant_provider (FMK)

#### Grant Type

- FMK: subsidy, loan, guarantee, surety, participation, sponsorship, award, other
- FDB: Beteiligung, Bürgschaft, Darlehen, Garantie, Sonstige, Zuschuss
- FF: Zuschuss, Anteilsfinanzierung/Kapitalbeteiligung, Kredit/Darlehen
- 



#### Time Info

- One Time Grants
- Repeating Grants
- Ongoing Grants

- EUFT:
    - deadline models: single-stage, multiple cut-off, two-stage
        - two-stage should become single-stage, we are only interested in first deadline
        - mulitple cut-off is like a repeating grant
    - deadline 


#### Funding Body

- FDB: Bund, EU, Land
- DSEE: has this but not as dedicated filter field
    - can be non-state actor
- FMK: grant_providers


