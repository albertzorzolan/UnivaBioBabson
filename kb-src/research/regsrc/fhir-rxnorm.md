Title: Rxnorm - FHIR v4.0.1

URL Source: https://hl7.org/fhir/R4/rxnorm.html

Markdown Content:
This page is part of the FHIR Specification (v4.0.1: R4 - Mixed [Normative](https://confluence.hl7.org/display/HL7/HL7+Balloting "Normative Standard") and [STU](https://confluence.hl7.org/display/HL7/HL7+Balloting "Standard for Trial-Use")) in it's permanent home (it will always be available at this URL). The current version which supercedes this version is [5.0.0](http://hl7.org/fhir/index.html). For a full list of available versions, see the [Directory of published versions ![Image 1](https://hl7.org/fhir/R4/external.png)](http://hl7.org/fhir/directory.html). Page versions: [R4B](http://hl7.org/fhir/R4B/rxnorm.html)**R4**[R3](http://hl7.org/fhir/STU3/rxnorm.html)[R2](http://hl7.org/fhir/DSTU2/rxnorm.html)

*   [Using Codes](https://hl7.org/fhir/R4/rxnorm.html#)
*   [Code Systems](https://hl7.org/fhir/R4/terminologies-systems.html)
*   [Value Sets](https://hl7.org/fhir/R4/terminologies-valuesets.html)
*   [Concept Maps](https://hl7.org/fhir/R4/terminologies-conceptmaps.html)
*   [Identifier Systems](https://hl7.org/fhir/R4/identifier-registry.html)

## 4.3.2[](https://hl7.org/fhir/R4/rxnorm.html) Using RxNorm with FHIR [](https://hl7.org/fhir/R4/rxnorm.html#4.3.2 "link to here")

### 4.3.2.1[](https://hl7.org/fhir/R4/rxnorm.html) Summary [](https://hl7.org/fhir/R4/rxnorm.html#4.3.2.1 "link to here")

Source RxNorm is made available by the [US National Library of Medicine ![Image 2](https://hl7.org/fhir/R4/external.png)](http://www.nlm.nih.gov/) at [http://www.nlm.nih.gov/research/umls/rxnorm ![Image 3](https://hl7.org/fhir/R4/external.png)](http://www.nlm.nih.gov/research/umls/rxnorm)
System The URI [http://www.nlm.nih.gov/research/umls/rxnorm ![Image 4](https://hl7.org/fhir/R4/external.png)](http://www.nlm.nih.gov/research/umls/rxnorm) identifies the RxNorm code system
Version Where a version is used, it should be the date of release, encoded as in the download files, e.g. "07092014"
Code The code value for an RxNorm code is a Concept Identifier (CUI), and only CUIs for which there is an SAB=RXNORM
Display The string description for the CUI that is associated with the source RXNORM. For further information, [see below](https://hl7.org/fhir/R4/rxnorm.html#display)
Inactive Todo: Describe how it is determined which concepts are inactive
Subsumption No Subsumption relationships are defined by RxNorm
Filter Properties Several properties are defined as described below

### 4.3.2.2[](https://hl7.org/fhir/R4/rxnorm.html) RxNorm MySQL Database [](https://hl7.org/fhir/R4/rxnorm.html#4.3.2.2 "link to here")

The RxNorm scripts are able to populate a MySQL database that contains the data from RxNorm. This page provides SQL statements that describe how to implement the features of the RxNorm terminology correctly against this database. These are provided for implementer convenience, and do not imply that any particular approach is required to be used in implementations.

### 4.3.2.3[](https://hl7.org/fhir/R4/rxnorm.html) Correct RxNorm Display [](https://hl7.org/fhir/R4/rxnorm.html#4.3.2.3 "link to here")

The correct display for a CUI is the string description for it associated with the source RXNORM. Given the RxNorm MySQL database, the correct display for a CUI can generally be determined by the SQL:

 Select STR from rxnconso where RXCUI = :code and SAB = 'RXNORM' and TTY in ('SCD', 'SBD')

Display values are not case sensitive, though case SHOULD be preserved.

### 4.3.2.4[](https://hl7.org/fhir/R4/rxnorm.html) Copyright/License Issues [](https://hl7.org/fhir/R4/rxnorm.html#4.3.2.4 "link to here")

Using RxNorm codes of type SAB=RXNORM as this specification describes [does not require ![Image 5](https://hl7.org/fhir/R4/external.png)](https://www.nlm.nih.gov/research/umls/rxnorm/docs/prescribe.html) a UMLS license. Access to the full set of RxNorm definitions, and/or additional use of other RxNorm structures and information requires a UMLS license. The use of RxNorm in this specification is pursuant to HL7's status as a licensee of the NLM UMLS. HL7's license does not convey the right to use RxNorm to any users of this specification; implementers must acquire a license to use RxNorm in their own right.

### 4.3.2.5 RxNorm Filter Properties [](https://hl7.org/fhir/R4/rxnorm.html#filters "link to here")

This section documents the property filters that can be used with the RxNorm code system in value set composition statements.

The base SQL statement for returning a list of CUIs that conform to these filters is:

  Select RXCUI from rxnconso where SAB = 'RXNORM' and TTY <> 'SY' 

#### 4.3.2.5.1[](https://hl7.org/fhir/R4/rxnorm.html) Semantic Type [](https://hl7.org/fhir/R4/rxnorm.html#4.3.2.5.1 "link to here")

Description Allows for the selection of a set of CUIs based on their Semantic Type
Property Name STY
Operations Allowed= / in
Values Allowed[column:]value
Comments If no column is specified, the default column is TUI
SQL and RXCUI in (select RXCUI from rxnsty where [:column] = :value)

#### 4.3.2.5.2[](https://hl7.org/fhir/R4/rxnorm.html) Source [](https://hl7.org/fhir/R4/rxnorm.html#4.3.2.5.2 "link to here")

Description Allows for the selection of a set of concepts that have mappings to a particular RxNorm concept
Property Name SAB
Operations Allowed= / in
Values Allowed Values from RxNorm SAB table (e.g. select RSAB from rxnsab)
SQL and RXCUI in (select RXCUI from rxnconso where SAB = :value)

#### 4.3.2.5.3[](https://hl7.org/fhir/R4/rxnorm.html) Term Type [](https://hl7.org/fhir/R4/rxnorm.html#4.3.2.5.3 "link to here")

Description Allows for the selection of a concept based on its designated type
Property Name TTY
Operations Allowed= / in
Values Allowed TTY values from the RxNorm Concept table (e.g. select distinct TTY from rxnconso)
SQL and TTY = :value

#### 4.3.2.5.4[](https://hl7.org/fhir/R4/rxnorm.html) Relationship [](https://hl7.org/fhir/R4/rxnorm.html#4.3.2.5.4 "link to here")

Description Allows for the selection of a concept based on its relationships
Property Name[REL]
Operations Allowed= / in
Values Allowed CUI:[RXCUI] or AUI:[RXAUI] must be a valid CUI or AUI. Note that a CUI does not need to have an SAB=RXNORM entry to be used here
Comments[REL] (:rel) is one of SY, SIB, RN, PAR, CHD, RB or RO
SQL for CUI: and (RXCUI in (select RXCUI from rxnconso where RXCUI in (select RXCUI1 from rxnrel where REL = :rel and RXCUI2 = :value)) for AUI: and (RXCUI in (select RXCUI from rxnconso where RXAUI in (select RXAUI1 from rxnrel where REL = :rel and RXAUI2 = :value))

#### 4.3.2.5.5[](https://hl7.org/fhir/R4/rxnorm.html) Relationship Type [](https://hl7.org/fhir/R4/rxnorm.html#4.3.2.5.5 "link to here")

Description Allows for the selection of a concept based on the type of its relationships
Property Name[RELA]
Operations Allowed= / in
Values Allowed CUI:[RXCUI] or AUI:[RXAUI] must be a valid CUI or AUI. Note that a CUI does not need to have an SAB=RXNORM entry to be used here
Comments[RELA] (:rela) is one of the relationship types defined in [RxNorm Appendix 1 ![Image 6](https://hl7.org/fhir/R4/external.png)](https://www.nlm.nih.gov/research/umls/rxnorm/docs/2016/appendix1.html) (the "RELA" column)
SQL for CUI: and (RXCUI in (select RXCUI from rxnconso where RXCUI in (select RXCUI1 from rxnrel where RELA = :rel and RXCUI2 = :value)) for AUI: and (RXCUI in (select RXCUI from rxnconso where RXAUI in (select RXAUI1 from rxnrel where RELA = :rel and RXAUI2 = :value))

### 4.3.2.6 RxNorm Properties [](https://hl7.org/fhir/R4/rxnorm.html#props "link to here")

In addition to the [standard properties](https://hl7.org/fhir/R4/terminology-service.html#standard-props), the following properties are defined for RxNorm:

(Yet to be done).

### 4.3.2.7 Implicit Value Sets [](https://hl7.org/fhir/R4/rxnorm.html#implicit "link to here")

Implicit value sets are those whose specification can be predicted based on the grammar of the underlying code system, and the known structure of the URL that refers to them. At the time of this publication, RxNorm does not define implicit value sets.

The identifier http://www.nlm.nih.gov/research/umls/rxnorm/vs represents a value set that contains all RxNorm CUIs.
