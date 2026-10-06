import os
import sys
import re
import json
import pypdf

# Ensure output directory exists
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'src', 'curriculum', 'seeds')
os.makedirs(OUT_DIR, exist_ok=True)

TERM_MAP = {
    'FIRST': 1,
    'SECOND': 2,
    'THIRD': 3,
    '1ST': 1,
    '2ND': 2,
    '3RD': 3
}

def clean_text(text: str) -> str:
    if not text:
        return ''
    # Replace non-breaking spaces and non-ascii artifacts
    text = text.replace('\xa0', ' ').replace('\u2013', '-').replace('\u2014', '-').replace('\u2019', "'").replace('\u2018', "'")
    text = re.sub(r'[\r\t]', ' ', text)
    text = re.sub(r'[ ]{2,}', ' ', text)
    return text.strip()

def parse_pdf1(filepath: str):
    print(f"Parsing PDF 1: {filepath}")
    reader = pypdf.PdfReader(filepath)
    print(f"Total pages: {len(reader.pages)}")

    jss_units = []
    sss_units = []

    current_class = None
    current_subject = None
    current_term = None

    for p_idx, page in enumerate(reader.pages):
        text = page.extract_text()
        if not text:
            continue
        lines = [clean_text(l) for l in text.split('\n') if clean_text(l)]
        if not lines:
            continue

        # Check for header in first few lines
        header_text = ' '.join(lines[:5])
        
        # Match class and subject
        class_sub_m = re.search(
            r'\b(JSS\s*[1-3]|SSS?\s*[1-3])\s+([A-Z0-9\s\(\)&,/\-]+?)\s+SCHEME OF WORK',
            header_text,
            re.IGNORECASE
        )
        if class_sub_m:
            raw_class = re.sub(r'\s+', ' ', class_sub_m.group(1).upper())
            if raw_class.startswith('JSS') and len(raw_class) == 4 and raw_class[3].isdigit():
                raw_class = f"JSS {raw_class[3]}"
            elif (raw_class.startswith('SS') or raw_class.startswith('SSS')) and len(raw_class) in (3, 4):
                digit = raw_class[-1]
                raw_class = f"SSS {digit}"
            current_class = raw_class
            
            raw_sub = class_sub_m.group(2).strip()
            # Clean subject name
            raw_sub = re.sub(r'\s+', ' ', raw_sub).strip(' -')
            current_subject = raw_sub

        term_m = re.search(r'\b(FIRST|SECOND|THIRD|1ST|2ND|3RD)\s+TERM\b', header_text, re.IGNORECASE)
        if term_m:
            current_term = TERM_MAP.get(term_m.group(1).upper(), 1)

        if not current_class or not current_subject or not current_term:
            continue

        # Find week entries in lines
        # Look for lines starting with week numbers
        i = 0
        while i < len(lines):
            line = lines[i]
            # Match "Week 1", "1", "11 - 13", "11–13", "Week 11 - 13"
            week_m = re.match(r'^(?:Week\s*)?(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\b(?:\s+(.*))?$', line, re.IGNORECASE)
            
            if week_m and ('SCHEME OF WORK' not in line) and ('TERM' not in line):
                start_w = int(week_m.group(1))
                end_w = int(week_m.group(2)) if week_m.group(2) else start_w
                
                # If start_w > 14, likely not a week number (e.g. page number or year)
                if 1 <= start_w <= 14:
                    rest = week_m.group(3) or ''
                    # Collect following lines until next week or header or page number
                    content_parts = [rest] if rest else []
                    j = i + 1
                    while j < len(lines):
                        next_line = lines[j]
                        if re.match(r'^(?:Week\s*)?\d{1,2}(?:\s*[-–]\s*\d{1,2})?\b', next_line, re.IGNORECASE) or \
                           ('SCHEME OF WORK' in next_line) or \
                           ('TERM' in next_line) or \
                           re.match(r'^\d{1,3}$', next_line):
                            break
                        content_parts.append(next_line)
                        j += 1
                    i = j - 1

                    combined_text = clean_text(' '.join(content_parts))
                    
                    # Split topic vs content if there is a separator or format
                    topic = combined_text
                    content = ""
                    if ';' in combined_text:
                        parts = combined_text.split(';', 1)
                        topic = parts[0].strip()
                        content = parts[1].strip()
                    elif ' - ' in combined_text:
                        parts = combined_text.split(' - ', 1)
                        topic = parts[0].strip()
                        content = parts[1].strip()
                    elif ':' in combined_text:
                        parts = combined_text.split(':', 1)
                        topic = parts[0].strip()
                        content = parts[1].strip()

                    # Clean topic
                    if not topic:
                        topic = f"Week {start_w} Topic"
                    
                    # Expand weeks
                    for w in range(start_w, min(end_w + 1, 14)):
                        sub_topics = [s.strip() for s in content.split(';') if s.strip()] if content else []
                        unit = {
                            "classLevel": current_class,
                            "subject": current_subject,
                            "term": current_term,
                            "week": w,
                            "topic": topic[:250],
                            "subTopics": sub_topics[:10],
                            "learningObjectives": [f"Understand {topic}"] if topic else [],
                            "competencies": ["Critical Thinking", "Problem Solving"],
                            "teachingActivities": content if content else None,
                            "teachingAids": "Charts, Textbook, Board",
                            "evaluationGuide": f"Assess student mastery on {topic}",
                            "referenceMaterials": ["NERDC National Curriculum 2025 Edition"]
                        }
                        if current_class.startswith("JSS"):
                            jss_units.append(unit)
                        else:
                            sss_units.append(unit)
            i += 1

    print(f"Extracted {len(jss_units)} JSS units and {len(sss_units)} SSS units from PDF 1")
    return jss_units, sss_units

def parse_pdf2(filepath: str):
    print(f"Parsing PDF 2: {filepath}")
    reader = pypdf.PdfReader(filepath)
    print(f"Total pages: {len(reader.pages)}")

    ece_units = []
    primary_units = []

    current_class = None
    current_subject = None
    current_term = None

    for p_idx, page in enumerate(reader.pages):
        text = page.extract_text()
        if not text:
            continue
        lines = [clean_text(l) for l in text.split('\n') if clean_text(l)]
        if not lines:
            continue

        header_text = ' '.join(lines[:6])

        # Match class and subject
        # Examples: "PRE-NURSERY HEALTH HABITS SCHEME OF WORK", "MATHEMATICS SCHEME OF WORK (PRIMARY 1)"
        # "ENGLISH LANGUAGE (PRIMARY 1)", "LITERACY (LETTER WORK) SCHEME OF WORK (NURSERY 3)"
        
        m_pri = re.search(r'([A-Z0-9\s\(\)&,/\-]+?)\s*(?:SCHEME OF WORK)?\s*\((PRIMARY\s*[1-6])\)', header_text, re.IGNORECASE)
        m_ece = re.search(r'\b(PRE-?NURSERY|NURSERY\s*[1-3]|KG\s*[1-2])\b[\s\n]*([A-Z0-9\s\(\)&,/\-]+?)(?:SCHEME OF WORK)?', header_text, re.IGNORECASE)
        m_ece2 = re.search(r'([A-Z0-9\s\(\)&,/\-]+?)\s*SCHEME OF WORK\s*\((PRE-?NURSERY|NURSERY\s*[1-3])\)', header_text, re.IGNORECASE)

        if m_pri:
            current_subject = clean_text(m_pri.group(1)).replace('SCHEME OF WORK', '').strip(' -()')
            raw_class = m_pri.group(2).upper()
            raw_class = re.sub(r'\s+', ' ', raw_class)
            current_class = raw_class
        elif m_ece2:
            current_subject = clean_text(m_ece2.group(1)).strip(' -()')
            current_class = clean_text(m_ece2.group(2).upper())
        elif m_ece:
            current_class = clean_text(m_ece.group(1).upper())
            subj_candidate = clean_text(m_ece.group(2)).replace('SCHEME OF WORK', '').strip(' -()')
            if subj_candidate:
                current_subject = subj_candidate

        term_m = re.search(r'\b(FIRST|SECOND|THIRD|1ST|2ND|3RD)\s+TERM\b', header_text, re.IGNORECASE)
        if term_m:
            current_term = TERM_MAP.get(term_m.group(1).upper(), 1)

        if not current_class or not current_subject or not current_term:
            continue

        # Look for week lines
        i = 0
        while i < len(lines):
            line = lines[i]
            week_m = re.match(r'^(?:Week\s*)?(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\b(?:\s+(.*))?$', line, re.IGNORECASE)
            if week_m and ('SCHEME OF WORK' not in line) and ('TERM' not in line) and ('TABLEOFCONTENT' not in line):
                start_w = int(week_m.group(1))
                end_w = int(week_m.group(2)) if week_m.group(2) else start_w
                if 1 <= start_w <= 14:
                    rest = week_m.group(3) or ''
                    content_parts = [rest] if rest else []
                    j = i + 1
                    while j < len(lines):
                        next_line = lines[j]
                        if re.match(r'^(?:Week\s*)?\d{1,2}(?:\s*[-–]\s*\d{1,2})?\b', next_line, re.IGNORECASE) or \
                           ('SCHEME OF WORK' in next_line) or \
                           ('TERM' in next_line) or \
                           ('TABLEOFCONTENT' in next_line) or \
                           re.match(r'^\d{1,3}\|\d{1,3}\|', next_line):
                            break
                        content_parts.append(next_line)
                        j += 1
                    i = j - 1

                    combined_text = clean_text(' '.join(content_parts))
                    topic = combined_text
                    content = ""
                    # Bullet points or semicolon
                    if '•' in combined_text:
                        parts = combined_text.split('•')
                        topic = parts[0].strip() or f"Week {start_w} Topic"
                        content = '; '.join([clean_text(p) for p in parts[1:] if clean_text(p)])
                    elif ';' in combined_text:
                        parts = combined_text.split(';', 1)
                        topic = parts[0].strip()
                        content = parts[1].strip()

                    for w in range(start_w, min(end_w + 1, 14)):
                        sub_topics = [s.strip() for s in content.split(';') if s.strip()] if content else []
                        unit = {
                            "classLevel": current_class,
                            "subject": current_subject,
                            "term": current_term,
                            "week": w,
                            "topic": topic[:250],
                            "subTopics": sub_topics[:10],
                            "learningObjectives": [f"Understand and demonstrate {topic}"] if topic else [],
                            "competencies": ["Foundational Literacy & Numeracy", "Observation"],
                            "teachingActivities": content if content else None,
                            "teachingAids": "Manipulatives, Flashcards, Learning Charts",
                            "evaluationGuide": f"Assess pupil progress on {topic}",
                            "referenceMaterials": ["NERDC / NAPPS Early Years & Primary Curriculum"]
                        }
                        if 'NURSERY' in current_class or 'PRE' in current_class or 'KG' in current_class:
                            ece_units.append(unit)
                        else:
                            primary_units.append(unit)
            i += 1

    print(f"Extracted {len(ece_units)} ECE units and {len(primary_units)} Primary units from PDF 2")
    return ece_units, primary_units

def deduplicate_units(units):
    seen = {}
    for u in units:
        key = (u['classLevel'], u['subject'], u['term'], u['week'])
        # If we have a better topic (longer or non-default), keep it
        if key not in seen:
            seen[key] = u
        else:
            if len(u['topic']) > len(seen[key]['topic']):
                seen[key] = u
    return list(seen.values())

def main():
    pdf1_path = os.path.join(os.path.dirname(__file__), '..', '..', 'NEW NERDC SCHEME, 2025.pdf')
    pdf2_path = os.path.join(os.path.dirname(__file__), '..', '..', 'nursurey-primary curriculum.pdf')

    jss_raw, sss_raw = parse_pdf1(pdf1_path)
    ece_raw, primary_raw = parse_pdf2(pdf2_path)

    jss_units = deduplicate_units(jss_raw)
    sss_units = deduplicate_units(sss_raw)
    primary_units = deduplicate_units(primary_raw)
    ece_units = deduplicate_units(ece_raw)

    print(f"Deduplicated counts:")
    print(f"  JSS Units: {len(jss_units)}")
    print(f"  SSS Units: {len(sss_units)}")
    print(f"  Primary Units: {len(primary_units)}")
    print(f"  ECE Units: {len(ece_units)}")

    with open(os.path.join(OUT_DIR, 'nerdc_jss_2025.json'), 'w', encoding='utf-8') as f:
        json.dump(jss_units, f, indent=2, ensure_ascii=False)

    with open(os.path.join(OUT_DIR, 'nerdc_sss_2025.json'), 'w', encoding='utf-8') as f:
        json.dump(sss_units, f, indent=2, ensure_ascii=False)

    with open(os.path.join(OUT_DIR, 'nerdc_primary_2025.json'), 'w', encoding='utf-8') as f:
        json.dump(primary_units, f, indent=2, ensure_ascii=False)

    with open(os.path.join(OUT_DIR, 'sabinote_ece_2025.json'), 'w', encoding='utf-8') as f:
        json.dump(ece_units, f, indent=2, ensure_ascii=False)

    print("All seed JSON files generated successfully!")

if __name__ == '__main__':
    main()
