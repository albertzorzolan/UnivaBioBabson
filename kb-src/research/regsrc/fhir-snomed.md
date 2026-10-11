Title: Snomedct - FHIR v4.0.1

URL Source: https://hl7.org/fhir/R4/snomedct.html

Markdown Content:
This page is part of the FHIR Specification (v4.0.1: R4 - Mixed [Normative](https://confluence.hl7.org/display/HL7/HL7+Balloting "Normative Standard") and [STU](https://confluence.hl7.org/display/HL7/HL7+Balloting "Standard for Trial-Use")) in it's permanent home (it will always be available at this URL). The current version which supercedes this version is [5.0.0](http://hl7.org/fhir/index.html). For a full list of available versions, see the [Directory of published versions ![Image 1](https://hl7.org/fhir/R4/external.png)](http://hl7.org/fhir/directory.html). Page versions: [R4B](http://hl7.org/fhir/R4B/snomedct.html)**R4**[R3](http://hl7.org/fhir/STU3/snomedct.html)[R2](http://hl7.org/fhir/DSTU2/snomedct.html)

*   [Using Codes](https://hl7.org/fhir/R4/snomedct.html#)
*   [Code Systems](https://hl7.org/fhir/R4/terminologies-systems.html)
*   [Value Sets](https://hl7.org/fhir/R4/terminologies-valuesets.html)
*   [Concept Maps](https://hl7.org/fhir/R4/terminologies-conceptmaps.html)
*   [Identifier Systems](https://hl7.org/fhir/R4/identifier-registry.html)

## 4.3.1.0[](https://hl7.org/fhir/R4/snomedct.html) Using SNOMED CT with FHIR [](https://hl7.org/fhir/R4/snomedct.html#4.3.1.0 "link to here")

### 4.3.1.0.1[](https://hl7.org/fhir/R4/snomedct.html) Summary [](https://hl7.org/fhir/R4/snomedct.html#4.3.1.0.1 "link to here")

Source SNOMED CT is owned, maintained and distributed by [SNOMED International ![Image 2](https://hl7.org/fhir/R4/external.png)](http://snomed.org/). SNOMED International is the organization which publishes the International Edition of SNOMED CT. SNOMED International Members may also distribute their own SNOMED CT National Edition, which contains the international release plus local extension content and derivatives.
System The URI [http://snomed.info/sct ![Image 3](https://hl7.org/fhir/R4/external.png)](http://snomed.info/sct) identifies the SNOMED CT code system.
Version Where a code system version is used, it should be specified as a URI that represents a specific SNOMED CT Edition published on a particular date (e.g. the International Edition or a National Edition, with a version date), following the [SNOMED CT URI Specification ![Image 4](https://hl7.org/fhir/R4/external.png)](http://snomed.org/uristandard) (see note below).
Code The following SNOMED CT artifacts are valid in the _code_ element for the http://snomed.info/sct namespace: [Concept IDs ![Image 5](https://hl7.org/fhir/R4/external.png)](https://confluence.ihtsdotools.org/display/DOCGLOSS/concept+identifier) and [SNOMED CT Expressions ![Image 6](https://hl7.org/fhir/R4/external.png)](https://confluence.ihtsdotools.org/display/DOCGLOSS/expression) (using [SNOMED CT Compositional Grammar ![Image 7](https://hl7.org/fhir/R4/external.png)](https://confluence.ihtsdotools.org/display/DOCSCG/Compositional+Grammar+-+Specification+and+Guide)). [SNOMED CT Terms ![Image 8](https://hl7.org/fhir/R4/external.png)](https://confluence.ihtsdotools.org/display/DOCGLOSS/term) and [Description Identifiers ![Image 9](https://hl7.org/fhir/R4/external.png)](https://confluence.ihtsdotools.org/display/DOCGLOSS/description+identifier) are not valid as codes in FHIR, nor are other alternative identifiers associated with SNOMED CT Concepts. 
Note: When [SNOMED CT Terms ![Image 10](https://hl7.org/fhir/R4/external.png)](https://confluence.ihtsdotools.org/display/DOCGLOSS/term) must be exchanged, use the [Description Id Extension.](https://hl7.org/fhir/R4/extension-coding-sctdescid.html)
Display The correct display for a [SNOMED CT concept ![Image 11](https://hl7.org/fhir/R4/external.png)](https://confluence.ihtsdotools.org/display/DOCGLOSS/Concept) is one of the [terms ![Image 12](https://hl7.org/fhir/R4/external.png)](https://confluence.ihtsdotools.org/display/DOCGLOSS/term) associated with that concept. The best display is the preferred term in the relevant language or dialect, as specified in the associated language reference set. SNOMED CT synonyms may be case sensitive. 
SNOMED International does not define terms for expressions. If a SNOMED terminology producer publishes human-readable terms for expressions in an expression repository, this term may be used as the display. Similarly, if a SNOMED terminology producer publishes an official template for generating terms from an expression, a term generated using the template may be used as the display. If no term or description template has been published, the full expression with terms embedded may be used.

Note that Display is not intended to contain terms entered by the user that have not been officially published by a SNOMED CT Terminology Producer.
Inactive Inactive codes are identified using the 'inactive' property (see below)
Subsumption SNOMED CT Subsumption testing for concepts is based on the |is a| relationship defined by SNOMED CT
Filter Properties Several filter properties are defined, as described below

This specification publishes a [canonical SNOMED CT](https://hl7.org/fhir/R4/codesystem-snomedct.html)[CodeSystem](https://hl7.org/fhir/R4/codesystem.html) resource. See also the [SNOMED CT Usage Summary](https://hl7.org/fhir/R4/snomedct-usage.html).

Note: The [SNOMED International glossary ![Image 13](https://hl7.org/fhir/R4/external.png)](http://snomed.org/gl) explains some of these SNOMED CT specific terms.

### 4.3.1.0.2[](https://hl7.org/fhir/R4/snomedct.html) Copyright and Licenses [](https://hl7.org/fhir/R4/snomedct.html#4.3.1.0.2 "link to here")

This specification includes content from SNOMED Clinical Terms® (SNOMED CT®) which is copyright of the International Health Terminology Standards Development Organisation (IHTSDO) (trading as SNOMED International). Implementers of these specifications must have the appropriate SNOMED CT Affiliate license - for more information contact [http://www.snomed.org/snomed-ct/get-snomed-ct ![Image 14](https://hl7.org/fhir/R4/external.png)](http://www.snomed.org/snomed-ct/get-snomed-ct) or [info@snomed.org](mailto:info@snomed.org).

### 4.3.1.0.3[](https://hl7.org/fhir/R4/snomedct.html) Versions [](https://hl7.org/fhir/R4/snomedct.html#4.3.1.0.3 "link to here")

There is no single distribution that contains all defined SNOMED CT codes in all contexts of use. Instead the International Edition contains all concepts shared and agreed to be internationally relevant and each National Release Centre distributes this International Edition plus additional national content (to extend the international set). Other release authorities may also be designated. The [SNOMED CT URI Specification ![Image 15](https://hl7.org/fhir/R4/external.png)](http://snomed.org/uristandard) describes how to unambiguously reference a particular version of a SNOMED CT edition:

  http://snomed.info/sct/[sctid]/version/[YYYYMMDD]

where [sctid] is the concept id that identifies the given SNOMED CT edition (based on the identifier of the most dependent module), and "YYYYMMDD" is the date of release. Examples of sctids that identify a specific edition are [listed here ![Image 16](https://hl7.org/fhir/R4/external.png)](https://confluence.ihtsdotools.org/display/DOCEXTPG/4.4.2+Edition+URI+Examples).

Note that many implementations are in the habit of simply using the date of release in the form YYYYMMDD (e.g. "20140531"), and assuming that the edition is known. However, this is not always safe, so implementations that populate the _version_ element SHOULD use the URI form.

Servers SHOULD regard provision of the date only for the version (without an sctid) as an error, and refuse to process the interaction or operation. At minimum the URI SHOULD contain the sctid of the SNOMED CT distribution:

http://snomed.info/sct/[sctid]

Implementers must note, if no version URI is provided when utilizing SNOMED CT, the Terminology Service may default to the most recent version of the SNOMED CT International Edition available on the service (or the latest available of another edition that may be preferred for the locale). Further, if the date of release is not provided, the Terminology Service may default to the most recent version of the named SNOMED CT distribution (e.g. 32506021000036107 for Australia).

In terms of the CodeSystem resource definitions, this means that SNOMED CT is distributed as a set of overlapping fragments that contain different parts of the entire code system that is SNOMED CT. Terminology servers and users always need to be aware of which fragment(s) are in use at any time, though implementations can sometimes safely assume that a national distribution is the only scope. Note that because of SNOMED CT's large size, there is no expectation that implementers will ever use a CodeSystem resource instead of the SNOMED CT RF2 format as a way to distribute SNOMED CT content.

### 4.3.1.0.4[](https://hl7.org/fhir/R4/snomedct.html) Display Terms for Specific Languages [](https://hl7.org/fhir/R4/snomedct.html#4.3.1.0.4 "link to here")

In the ValueSet resource any number of terms ('[designations ![Image 17](https://hl7.org/fhir/R4/external.png)](http://build.fhir.org/valueset.html#designations)') in additional languages and dialects can be specified for a particular concept in a value set definition using the [ValueSet.compose.include.concept.designation ![Image 18](https://hl7.org/fhir/R4/external.png)](http://build.fhir.org/codesystem-definitions.html#CodeSystem.concept.designation) element. The language is specified as a [BCP-47 ![Image 19](https://hl7.org/fhir/R4/external.png)](http://tools.ietf.org/html/bcp47) language code as required by the '[designation.language ![Image 20](https://hl7.org/fhir/R4/external.png)](http://build.fhir.org/valueset-definitions.html#ValueSet.compose.include.concept.designation.language)' element, with the value taken from the 'languageCode' field of the RF2 Descriptions file ('languageCode' is ISO-639-1, a subset of BCP-47). The [type ![Image 21](https://hl7.org/fhir/R4/external.png)](http://build.fhir.org/valueset-designation-use.html) of the term (e.g., the SNOMED CT code for "Fully specified name", "Synonym" or "Definition") can be specified in '[designation.use ![Image 22](https://hl7.org/fhir/R4/external.png)](http://build.fhir.org/valueset-definitions.html#ValueSet.compose.include.concept.designation.use)'.

[Note that ValueSet.compose.include.concept is only used when the value set is defined extensionally (i.e. as an enumerated list of concepts). For intensionally-defined value sets (i.e. using one or more filters) additional terms could be added using CodeSystem.concept.designation, as noted below.]

The CodeSystem resource can also similarly be used to specify additional terms ('[designations ![Image 23](https://hl7.org/fhir/R4/external.png)](http://build.fhir.org/codesystem.html#designations)') for a concept using the [CodeSystem.concept.designation ![Image 24](https://hl7.org/fhir/R4/external.png)](http://build.fhir.org/codesystem-definitions.html#CodeSystem.concept.designation) element (the additional terms may be from a published national or other localized SNOMED CT edition or provided in a [code system supplement ![Image 25](https://hl7.org/fhir/R4/external.png)](http://build.fhir.org/codesystem.html#supplements)). If supported by the terminology server, the additional terms are available to be returned in a [value set expansion ![Image 26](https://hl7.org/fhir/R4/external.png)](http://build.fhir.org/valueset.html#expansion) (controlled by the [$expand ![Image 27](https://hl7.org/fhir/R4/external.png)](http://build.fhir.org/valueset-operation-expand.html#4.8.1.1) operation 'includeDesignations' input parameter).

### 4.3.1.0.5[](https://hl7.org/fhir/R4/snomedct.html) SNOMED CT Expressions [](https://hl7.org/fhir/R4/snomedct.html#4.3.1.0.5 "link to here")

A [SNOMED CT Expression ![Image 28](https://hl7.org/fhir/R4/external.png)](https://confluence.ihtsdotools.org/display/DOCGLOSS/SNOMED+CT+expression) is a structured combination of one or more clinical concepts, stated using [Compositional Grammar Syntax ![Image 29](https://hl7.org/fhir/R4/external.png)](https://confluence.ihtsdotools.org/display/DOCSCG). Expressions may optionally contain display terms.

### 4.3.1.0.6[](https://hl7.org/fhir/R4/snomedct.html) RDF [](https://hl7.org/fhir/R4/snomedct.html#4.3.1.0.6 "link to here")

The SNOMED International URI specification uses the namespace http://snomed.info/sct for the code system, and the URI http://snomed.info/id for the individual concepts in the code system. This means that when a SNOMED CT concept is converted from the system::code pair, where the system is http://snomed.info/sct, to the [RDF ontological form](https://hl7.org/fhir/R4/rdf.html), the representation is http://snomed.info/id/[concept-id]. Expressions are represented using the URI pattern http://snomed.info/scg/[expression]. Expressions represented in this way SHALL NOT contain whitespace, terms or comments.

### 4.3.1.0.7 SNOMED CT Properties [](https://hl7.org/fhir/R4/snomedct.html#props "link to here")

In addition to the [standard properties](https://hl7.org/fhir/R4/terminology-service.html#standard-props), the following properties are defined for SNOMED CT:

**Property Name****Data Type****Comments**
inactive boolean Whether the code is active or not (defaults to false). This is derived from the active column in the Concept file of the RF2 Distribution (by inverting the value).
sufficientlyDefined boolean True if the description logic definition of the concept includes sufficient conditions. This is derived from the definitionStatusId value in the Concept file of the RF2 distribution (i.e. If 900000000000073002 |Sufficiently defined concept definition status| then true).
moduleId code The SNOMED CT concept id of the module that the concept belongs to.
normalForm string Generated Necessary Normal Form expression for the provided code or expression, with terms. The normal form expressions are not suitable for use in subsumption testing.
normalFormTerse string Generated Necessary Normal form expression for the provided code or expression, concept ids only. The normal form expressions are not suitable for use in subsumption testing.

SNOMED CT relationships, where the relationship type is subsumed by 410662002 |Concept model attribute|, also automatically become properties. Properties that represent SNOMED CT concept model attributes are referred to using their concept id, rather than their human readable term.

For example, the laterality property is represented using the concept id '272741003', rather than the term 'laterality':

Note that when a [$lookup](https://hl7.org/fhir/R4/codesystem-operation-lookup.html) operation is performed on a SNOMED CT concept, servers SHALL return the URI for the edition and version being used (see above) in the `version` property. Other properties are at the discretion of the server and the client.

### 4.3.1.0.8 SNOMED CT Filters [](https://hl7.org/fhir/R4/snomedct.html#filters "link to here")

This section documents the property filters that can be used with the SNOMED CT code system in value set composition statements. For implementer convenience, some of the property filters are documented in terms of the [SNOMED CT Expression Constraint Language ![Image 30](https://hl7.org/fhir/R4/external.png)](http://snomed.org/ecl), but this does not imply that its use is required.

#### 4.3.1.0.8.1[](https://hl7.org/fhir/R4/snomedct.html) By Subsumption [](https://hl7.org/fhir/R4/snomedct.html#4.3.1.0.8.1 "link to here")

Description Select a set of concepts based on subsumption testing
Property Name concept
Operations Allowed is-a
Values Allowed[concept id]
Comments Includes all concept ids that have a transitive is-a relationship with the concept id provided as the value (including the concept itself)
Example[Administration Methods](https://hl7.org/fhir/R4/valueset-administration-method-codes.html)
[SCT ECL ![Image 31](https://hl7.org/fhir/R4/external.png)](http://snomed.org/ecl)<< [concept] (Long syntax: descendantOrSelfOf [concept])

#### 4.3.1.0.8.2[](https://hl7.org/fhir/R4/snomedct.html) By Reference Set [](https://hl7.org/fhir/R4/snomedct.html#4.3.1.0.8.2 "link to here")

Description Select a set of concepts based on their membership of a SNOMED CT reference set
Property Name concept
Operations Allowed in
Values Allowed[concept id]
Comments Includes all concept ids that are active members of the reference set identified by the concept id provided as the value
[SCT ECL ![Image 32](https://hl7.org/fhir/R4/external.png)](http://snomed.org/ecl)^ [concept] (Long syntax: memberOf [concept])

#### 4.3.1.0.8.3[](https://hl7.org/fhir/R4/snomedct.html) By SNOMED Expression Constraint [](https://hl7.org/fhir/R4/snomedct.html#4.3.1.0.8.3 "link to here")

Description Select a set of concepts based on a formal expression constraint
Property Name constraint
Operations Allowed=
Values Allowed[expression constraint]
Comments The result of the filter is the result of executing the given [SNOMED CT Expression Constraint ![Image 33](https://hl7.org/fhir/R4/external.png)](http://snomed.org/ecl).   
 Example:  "compose": {
  "include": [
    {
      "system": "http://snomed.info/sct",
      "filter": [
        {
          "property": "constraint",
          "op": "=",
          "value": "<< 30506011000036107 |Australian product|: 700000101000036108 |hasTP| = 17311000168105 |Panadol|"
        }
      ]
    }
  ]
}

#### 4.3.1.0.8.4[](https://hl7.org/fhir/R4/snomedct.html) By whether post-coordination is allowed [](https://hl7.org/fhir/R4/snomedct.html#4.3.1.0.8.4 "link to here")

Description Specify whether post-coordination is allowed or not
Property Name expressions
Operations Allowed=
Values Allowed true or false
Comments Expressions, if allowed, are subject to the same rules as precoordinated concepts. [Note: Simple reference sets do not include expressions.]
Example[Administration Methods](https://hl7.org/fhir/R4/valueset-administration-method-codes.html)
[SCT ECL ![Image 34](https://hl7.org/fhir/R4/external.png)](http://snomed.org/ecl)n/a

### 4.3.1.0.9 Implicit Value Sets [](https://hl7.org/fhir/R4/snomedct.html#implicit "link to here")

Implicit value sets are those whose specification can be predicted based on the grammar of the underlying code system, and the known structure of the URL that identifies them. SNOMED CT has two common sets of implicit value sets defined: By Subsumption, and By Reference Set. These implicit value sets do not use complex queries. Implicit value sets can also be defined using an expression constraint. The implicit value set capability allows a single URL to serve as a value set definition, and can serve as the basis for the [$expand](https://hl7.org/fhir/R4/valueset-operation-expand.html) operation and for other value set references.

If any value set resources exist with an identifier that conforms to the URL patterns specified below, the content of the resource must conform to the template provided. Profiles and other value set references can reference these value sets directly (by reference as a URI, rather than by a literal value set reference).

A SNOMED CT implicit value set URL has two parts:

The URL [http://snomed.info/sct ![Image 35](https://hl7.org/fhir/R4/external.png)](http://snomed.info/sct) should be understood to mean an unspecified edition/version. This defines an incomplete value set whose actual membership will depend on the edition used when it is expanded. If no version or edition is specified, the terminology service SHALL use the latest version available for its default edition (or the International Edition, if no other edition is the default).

For the second part of the URL (the query part), the 5 possible values are:

*   ?fhir_vs - all concept ids in the edition/version. If the base URI is [http://snomed.info/sct ![Image 36](https://hl7.org/fhir/R4/external.png)](http://snomed.info/sct), this means all possible SNOMED CT concepts
*   ?fhir_vs=isa/[sctid] - all concept ids that are subsumed by the specified concept.
*   ?fhir_vs=refset - all concept ids that correspond to reference sets that are explicitly defined in the specified SNOMED CT edition
*   ?fhir_vs=refset/[sctid] - all concept ids in the specified reference set
*   ?fhir_vs=ecl/[ecl] - all concept ids that match the supplied (URI-encoded) expression constraint

A value set with a URL that follows the pattern "[edition/version]?fhir_vs=isa/[sctid]" follows this template:

<ValueSet xmlns="http://hl7.org/fhir">
  <text>
    <status value="generated"/>
    <div xmlns="http://www.w3.org/1999/xhtml">
     [Some HTML that describes this value set as all concepts subsumed by sctid]
    </div>
  </text>
  <url value="[edition/version]?fhir_vs=isa/[sctid]"/>
  <version value="[edition/version]"/>
  <name value="SNOMED CT Concept [sctid] and descendants"/>
  <description value="All SNOMED CT concepts for [sctid or preferred description]"/>
  <copyright value="This value set includes content from SNOMED CT, which is copyright © 2002+ International Health Terminology Standards Development Organisation (SNOMED International), and distributed by agreement between SNOMED International and HL7. Implementer use of SNOMED CT is not covered by this agreement"/>
  <status value="active"/>
  <compose>
    <include>
      <system value="http://snomed.info/sct"/>
      <filter>
        <property value="concept"/>
        <op value="is-a"/>
        <value value="[sctid]"/>
      </filter>
    </include>
  </compose>
</ValueSet>

The value set with a url that follows the pattern "[edition/version]?fhir_vs=refset" follows this template:

<ValueSet xmlns="http://hl7.org/fhir">
  <text>
    <status value="generated"/>
    <div xmlns="http://www.w3.org/1999/xhtml">
     [Some HTML that describes this value set as all concepts with associated reference sets]
    </div>
  </text>
  <url value="[edition/version]?fhir_vs=refset"/>
  <version value="[edition/version]"/>
  <name value="SNOMED CT Reference Sets"/>
  <description value="All SNOMED CT concepts associated with a reference set"/>
  <copyright value="This value set includes content from SNOMED CT, which is copyright © 2002+ International Health Terminology Standards Development Organisation (SNOMED International), and distributed by agreement between SNOMED International and HL7. Implementer use of SNOMED CT is not covered by this agreement"/>
  <status value="active"/>
  <compose>
    <include>
      <system value="http://snomed.info/sct"/>
      <!-- repeat: one concept element with a code for each concept that has an associated reference set -->
      <concept>
        <code value="[sctid]"/>
      </concept>
      <!-- end repeat -->
    </include>
  </compose>
</ValueSet>

For each concept that is associated with a reference set, there will be one 'concept' element with a contained 'code' element that contains the sctid.

A value set with a url that follows the pattern "[edition/version]?fhir_vs=refset/[sctid]" follows this template:

<ValueSet xmlns="http://hl7.org/fhir">
  <text>
    <status value="generated"/>
    <div xmlns="http://www.w3.org/1999/xhtml">
     [Some HTML that describes this value set as all concepts in the reference set identified by sctid]
    </div>
  </text>
  <url value="[edition/version]?fhir_vs=refset/[sctid]"/>
  <version value="[edition/version]"/>
  <name value="SNOMED CT Reference Set [sctid]"/>
  <description value="All SNOMED CT concepts in the reference set [sctid or preferred description]"/>
  <copyright value="This value set includes content from SNOMED CT, which is copyright © 2002+ International Health Terminology Standards Development Organisation (SNOMED International), and distributed by agreement between SNOMED International and HL7. Implementer use of SNOMED CT is not covered by this agreement"/>
  <status value="active"/>
  <compose>
    <include>
      <system value="http://snomed.info/sct"/>
      <filter>
        <property value="concept"/>
        <op value="in"/>
        <value value="[sctid]"/>
      </filter>
    </include>
  </compose>
</ValueSet>

A value set with a url that follows the pattern "[edition/version]?fhir_vs=ecl/[ecl]" follows this template:

<ValueSet xmlns="http://hl7.org/fhir">
  <text>
    <status value="generated"/>
    <div xmlns="http://www.w3.org/1999/xhtml">
     [Some HTML that describes this value set as all concepts that match the expression constraint ecl]
    </div>
  </text>
  <url value="[edition/version]?fhir_vs=ecl/[ecl]"/>
  <version value="[edition/version]"/>
  <name value="SNOMED CT Concepts matching [ecl]"/>
  <description value="All SNOMED CT concepts that match the expression constraint [ecl]"/>
  <copyright value="This value set includes content from SNOMED CT, which is copyright © 2002+ International Health Terminology Standards Development Organisation (SNOMED International), and distributed by agreement between SNOMED International and HL7. Implementer use of SNOMED CT is not covered by this agreement"/>
  <status value="active"/>
  <compose>
    <include>
      <system value="http://snomed.info/sct"/>
      <filter>
        <property value="constraint"/>
        <op value="="/>
        <value value="[ecl]"/>
      </filter>
    </include>
  </compose>
</ValueSet>

### 4.3.1.0.10 Implicit Concept Maps [](https://hl7.org/fhir/R4/snomedct.html#implicit-cm "link to here")

Implicit concept maps are those whose specification can be predicted based on the grammar and/or content of the underlying code system, and the known structure of the URL that identifies them. This allows a single URL to serve as a concept map definition that defines a mapping between two sets of concepts, and which can serve as the basis for the [$translate](https://hl7.org/fhir/R4/conceptmap-operation-translate.html) operation. SNOMED CT has two common sets of implicit concept maps defined:

*   Association Reference Sets
*   Simple Map Reference Sets

[Association Reference Sets ![Image 37](https://hl7.org/fhir/R4/external.png)](https://confluence.ihtsdotools.org/display/DOCRELFMT/5.2.5+Association+Reference+Set) are part of the core SNOMED CT distribution. The following standard Association Reference sets can be used for implicit concept maps:

**Name****Concept Id****Relationship**
POSSIBLY EQUIVALENT TO 900000000000523009 inexact
REPLACED BY 900000000000526001 equivalent
SAME AS 900000000000527005 equal
ALTERNATIVE 900000000000530003 inexact

[Simple Map Reference Sets ![Image 38](https://hl7.org/fhir/R4/external.png)](https://confluence.ihtsdotools.org/display/DOCRELFMT/5.2.5+Association+Reference+Set) (reference sets which are descendants of 900000000000496009 "Simple map") also define an implicit concept map.

If any ConceptMap resources exist with an identifier that conforms to the URL pattern specified below, the content of the resource must conform to the template provided. Canonical references to ConceptMap resource instances are made using their URI.

A SNOMED CT implicit concept map URL has two parts:

The URL [http://snomed.info/sct ![Image 39](https://hl7.org/fhir/R4/external.png)](http://snomed.info/sct) should be understood to mean an unspecified edition/version. This defines an incomplete concept map whose actual membership will depend on the edition being used. If no version or edition is specified, the terminology service SHALL use the latest version available for its default edition (or the International Edition, if no other edition is the default).

For the second part of the URL (the query part), there is only one possible value:

*   ?fhir_cm=[sctid] - where [sctid] is a value from the table above

A concept map with a URL that follows the pattern "[edition/version]?fhir_cm=[sctid]" follows this template, where [name], [sctid] and [relationship] are taken from the table above:

<ConceptMap xmlns="http://hl7.org/fhir">
  <text>
    <status value="generated"/>
    <div xmlns="http://www.w3.org/1999/xhtml">
     [Some HTML that describes this concept map]
    </div>
  </text>
  <url value="[edition/version]?fhir_cm=[sctid]"/>
  <version value="[edition/version]"/>
  <name value="SNOMED CT [name] Concept Map"/>
  <description value="The concept map implicitly defined by the [name] Association Reference Set"/>
  <copyright value="This value set includes content from SNOMED CT, which is copyright © 2002+ International Health Terminology Standards Development Organisation (SNOMED International), and distributed by agreement between SNOMED International and HL7. Implementer use of SNOMED CT is not covered by this agreement"/>
  <status value="active"/>

  <sourceUri value="[edition/version]?fhir_vs"/>
  <targetUri value="[edition/version]?fhir_vs"/>
  <group>  <!-- 0..* Same source and target systems -->
    <source value="http://snomed.info/sct"/>
    <sourceVersion value="[edition/version]"/>
    <target value="http://snomed.info/sct"/>
    <targetVersion value="[edition/version]"/>

    <!-- a mapping for each member of the reference set -->
    <element>
      <code value="[member]"/>
      <target>
        <code value="[reference set value]"/>
        <equivalence value="[relationship]"/>
      </target>
    </element>
  </group>
</ConceptMap>
