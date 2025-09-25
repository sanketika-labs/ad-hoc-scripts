import csv
import json
import re
import requests
import argparse
import logging

CSV_FILE = 'fw-c-t.csv'

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Load configuration
with open('config.json', 'r') as f:
    config = json.load(f)

host = config['host']
apikey = config['apikey']
channel_id = config['channel_id']

# Read CSV and collect unique code to area mapping
code_to_area = {}
with open(CSV_FILE, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        row = {k.strip(): v.strip() for k, v in row.items()}
        code = row['Domain_Code']
        area = row['Domain_Description']
        if code not in code_to_area:
            code_to_area[code] = area

# Store framework codes
framework_codes = []

def send_request(method, url, headers, data=None, dry_run=False):
    if dry_run:
        logging.info(f"Dry run: {method} {url}")
        logging.info(f"Headers: {headers}")
        if data:
            logging.info(f"Data: {json.dumps(data, indent=2, ensure_ascii=False)}")
        return None
    try:
        if method == 'POST':
            response = requests.post(url, headers=headers, json=data)
        elif method == 'PATCH':
            response = requests.patch(url, headers=headers, json=data)
        logging.info(f"Response status: {response.status_code}")
        if response.status_code != 200:
            logging.error(f"Response text: {response.text}")
        return response
    except Exception as e:
        logging.error(f"Request failed: {e}")
        return None

def create_frameworks(dry_run=False):
    global framework_codes
    logging.info(f"Starting to create {len(code_to_area)} frameworks")
    success_count = 0
    for code, area in code_to_area.items():
        match = re.search(r'(\d+)$', code)
        if match:
            prefix = code[:match.start()]
            number = match.group(1)
            framework_code = prefix + '_' + number
        else:
            framework_code = code
        name = area + " Framework"
        description = name
        
        logging.info(f"Creating framework: {framework_code} ({name})")
        url = f"{host}/api/framework/v1/create"
        headers = {
            'Content-Type': 'application/json',
            'accept': 'application/json',
            'X-Channel-Id': channel_id,
            'Authorization': f'Bearer {apikey}'
        }
        data = {
            "request": {
                "framework": {
                    "name": name,
                    "description": description,
                    "type": "SkillMap",
                    "code": framework_code,
                    "channels": [
                        {
                            "identifier": channel_id
                        }
                    ],
                    "systemDefault": "Yes"
                }
            }
        }
        
        response = send_request('POST', url, headers, data, dry_run)
        if dry_run:
            framework_codes.append(framework_code)
            logging.info(f"Framework {framework_code} created successfully (dry-run)")
            success_count += 1
        elif response and response.status_code == 200:
            framework_codes.append(framework_code)
            logging.info(f"Framework {framework_code} created successfully")
            success_count += 1
        else:
            logging.error(f"Failed to create framework {framework_code}")
    logging.info(f"Framework creation completed: {success_count}/{len(code_to_area)} successful")

def create_master_and_categories(dry_run=False):
    # Create categories for each framework
    categories = [
        {"name": "Domain", "code": "domain"},
        {"name": "Skill", "code": "skill"},
        {"name": "Sub Skill", "code": "subSkill"},
        {"name": "Observable Element", "code": "observableElement"}
    ]

    total_categories = len(framework_codes) * len(categories)
    logging.info(f"Starting to create {total_categories} categories across {len(framework_codes)} frameworks")
    success_count = 0
    
    for framework_code in framework_codes:
        logging.info(f"Creating categories for framework: {framework_code}")
        for cat in categories:
            logging.info(f"Creating category: {cat['name']} ({cat['code']}) for framework {framework_code}")
            url = f"{host}/api/framework/v1/category/create?framework={framework_code}"
            headers = {
                'Content-Type': 'application/json',
                'accept': 'application/json',
                'X-Channel-Id': channel_id,
                'Authorization': f'Bearer {apikey}'
            }
            data = {
                "request": {
                    "category": cat
                }
            }
            
            response = send_request('POST', url, headers, data, dry_run)
            if dry_run:
                logging.info(f"Category {cat['name']} created successfully for {framework_code} (dry-run)")
                success_count += 1
            elif response and response.status_code == 200:
                logging.info(f"Category {cat['name']} created successfully for {framework_code}")
                success_count += 1
            else:
                logging.error(f"Failed to create category {cat['name']} for {framework_code}")
    logging.info(f"Category creation completed: {success_count}/{total_categories} successful")

def create_terms(dry_run=False):
    global framework_codes
    if not framework_codes:
        # Populate framework_codes if not already done
        for code, area in code_to_area.items():
            match = re.search(r'(\d+)$', code)
            if match:
                prefix = code[:match.start()]
                number = match.group(1)
                framework_code = prefix + '_' + number
            else:
                framework_code = code
            framework_codes.append(framework_code)
    
    logging.info(f"Starting term creation for {len(framework_codes)} frameworks")
    logging.debug(f"Framework codes available for term creation: {framework_codes}")
    
    # Dictionaries to store created term codes to avoid duplicates
    created_domains = set()
    created_skills = {}
    created_subskills = {}
    created_observable_elements = {}
    
    # Dictionaries to store term IDs
    term_ids = {
        'domain': {},
        'skill': {},
        'subSkill': {},
        'observableElement': {}
    }
    
    domain_count = 0
    skill_count = 0
    subskill_count = 0
    observable_count = 0
    
    with open(CSV_FILE, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        logging.info(f"Processing {len(rows)} rows from CSV {CSV_FILE}")
        for idx, row in enumerate(rows, start=1):
            row = {k.strip(): v.strip() for k, v in row.items()}
            original_code = row.get('Domain_Code')
            if original_code is None:
                logging.warning(f"Row {idx}: Missing 'Domain_Code' column. Row data: {row}")
                continue
            match = re.search(r'(\d+)$', original_code)
            if match:
                prefix = original_code[:match.start()]
                number = match.group(1)
                framework_code = prefix + '_' + number
            else:
                framework_code = original_code
            logging.debug(f"Row {idx}: original_code={original_code} computed_framework_code={framework_code}")
            if framework_code not in framework_codes:
                logging.debug(f"Row {idx}: Skipping because framework_code {framework_code} not in initialized frameworks {framework_codes}")
                continue
            
            # Create domain term if not already created for this framework
            domain_code = original_code.lower()
            if domain_code not in created_domains:
                domain_name = row['Domain_Description']
                logging.info(f"Creating domain term: {original_code} ({domain_name}) for framework {framework_code}")
                url = f"{host}/api/framework/v1/term/create?framework={framework_code}&category=domain"
                headers = {
                    'Content-Type': 'application/json',
                    'accept': 'application/json',
                    'X-Channel-Id': channel_id,
                    'Authorization': f'Bearer {apikey}'
                }
                data = {
                    "request": {
                        "term": {
                            "name": domain_name,
                            "code": original_code
                        }
                    }
                }
                response = send_request('POST', url, headers, data, dry_run)
                if not dry_run and response and response.status_code == 200:
                    result = response.json().get('result', {})
                    node_id = result.get('node_id', [None])[0]
                    if node_id:
                        term_ids['domain'][framework_code] = node_id
                    created_domains.add(domain_code)
                    logging.info(f"Domain term {original_code} created successfully for {framework_code}")
                    domain_count += 1
                elif dry_run:
                    term_ids['domain'][framework_code] = f"{framework_code.lower()}_domain"
                    created_domains.add(domain_code)
                    logging.info(f"Domain term {original_code} created successfully for {framework_code} (dry-run)")
                    domain_count += 1
                else:
                    logging.error(f"Failed to create domain term {original_code} for {framework_code}")
            
            # Create skill term
            skill_code = row['Competency_Code'].lower()
            skill_key = f"{framework_code}_{skill_code}"
            if framework_code not in created_skills:
                created_skills[framework_code] = set()
            if skill_code not in created_skills[framework_code]:
                skill_name = row['Competency_Description']
                logging.info(f"Creating skill term: {row['Competency_Code']} ({skill_name}) for framework {framework_code}")
                url = f"{host}/api/framework/v1/term/create?framework={framework_code}&category=skill"
                headers = {
                    'Content-Type': 'application/json',
                    'accept': 'application/json',
                    'X-Channel-Id': channel_id,
                    'Authorization': f'Bearer {apikey}'
                }
                data = {
                    "request": {
                        "term": {
                            "name": skill_name,
                            "code": row['Competency_Code']
                        }
                    }
                }
                response = send_request('POST', url, headers, data, dry_run)
                if not dry_run and response and response.status_code == 200:
                    result = response.json().get('result', {})
                    node_id = result.get('node_id', [None])[0]
                    if node_id:
                        term_ids['skill'][skill_key] = node_id
                    created_skills[framework_code].add(skill_code)
                    logging.info(f"Skill term {row['Competency_Code']} created successfully for {framework_code}")
                    skill_count += 1
                elif dry_run:
                    term_ids['skill'][skill_key] = f"{framework_code.lower()}_skill_{skill_code}"
                    created_skills[framework_code].add(skill_code)
                    logging.info(f"Skill term {row['Competency_Code']} created successfully for {framework_code} (dry-run)")
                    skill_count += 1
                else:
                    logging.error(f"Failed to create skill term {row['Competency_Code']} for {framework_code}")
            
            # Create subSkill term
            subskill_code = row['Sub-competency_Code'].lower()
            subskill_key = f"{framework_code}_{subskill_code}"
            if framework_code not in created_subskills:
                created_subskills[framework_code] = set()
            if subskill_code not in created_subskills[framework_code]:
                subskill_name = row['Sub-competency_Description']
                logging.info(f"Creating subskill term: {row['Sub-competency_Code']} ({subskill_name}) for framework {framework_code}")
                url = f"{host}/api/framework/v1/term/create?framework={framework_code}&category=subSkill"
                headers = {
                    'Content-Type': 'application/json',
                    'accept': 'application/json',
                    'X-Channel-Id': channel_id,
                    'Authorization': f'Bearer {apikey}'
                }
                data = {
                    "request": {
                        "term": {
                            "name": subskill_name,
                            "code": row['Sub-competency_Code']
                        }
                    }
                }
                response = send_request('POST', url, headers, data, dry_run)
                if not dry_run and response and response.status_code == 200:
                    result = response.json().get('result', {})
                    node_id = result.get('node_id', [None])[0]
                    if node_id:
                        term_ids['subSkill'][subskill_key] = node_id
                    created_subskills[framework_code].add(subskill_code)
                    logging.info(f"Subskill term {row['Sub-competency_Code']} created successfully for {framework_code}")
                    subskill_count += 1
                elif dry_run:
                    term_ids['subSkill'][subskill_key] = f"{framework_code.lower()}_subskill_{subskill_code}"
                    created_subskills[framework_code].add(subskill_code)
                    logging.info(f"Subskill term {row['Sub-competency_Code']} created successfully for {framework_code} (dry-run)")
                    subskill_count += 1
                else:
                    logging.error(f"Failed to create subskill term {row['Sub-competency_Code']} for {framework_code}")
            
            # Create observableElement term
            observable_code = row['Code observable element'].lower()
            observable_key = f"{framework_code}_{observable_code}"
            if framework_code not in created_observable_elements:
                created_observable_elements[framework_code] = set()
            if observable_code not in created_observable_elements[framework_code]:
                observable_name = row['Observable elements']
                logging.info(f"Creating observable element term: {row['Code observable element']} ({observable_name}) for framework {framework_code}")
                url = f"{host}/api/framework/v1/term/create?framework={framework_code}&category=observableElement"
                headers = {
                    'Content-Type': 'application/json',
                    'accept': 'application/json',
                    'X-Channel-Id': channel_id,
                    'Authorization': f'Bearer {apikey}'
                }
                data = {
                    "request": {
                        "term": {
                            "name": observable_name,
                            "code": row['Code observable element']
                        }
                    }
                }
                response = send_request('POST', url, headers, data, dry_run)
                if not dry_run and response and response.status_code == 200:
                    result = response.json().get('result', {})
                    node_id = result.get('node_id', [None])[0]
                    if node_id:
                        term_ids['observableElement'][observable_key] = node_id
                    created_observable_elements[framework_code].add(observable_code)
                    logging.info(f"Observable element term {row['Code observable element']} created successfully for {framework_code}")
                    observable_count += 1
                elif dry_run:
                    term_ids['observableElement'][observable_key] = f"{framework_code.lower()}_observableelement_{observable_code}"
                    created_observable_elements[framework_code].add(observable_code)
                    logging.info(f"Observable element term {row['Code observable element']} created successfully for {framework_code} (dry-run)")
                    observable_count += 1
                else:
                    logging.error(f"Failed to create observable element term {row['Code observable element']} for {framework_code}")
    
    # Save term_ids for associations
    cleaned_term_ids = clean_dict(term_ids)
    with open('term_ids.json', 'w', encoding='utf-8') as f:
        json.dump(cleaned_term_ids, f, ensure_ascii=False)
    logging.info("Term IDs saved to term_ids.json")
    logging.info(f"Term creation completed: Domains: {domain_count}, Skills: {skill_count}, Subskills: {subskill_count}, Observable Elements: {observable_count}")

def update_associations(dry_run=False):
    global framework_codes
    if not framework_codes:
        # Populate framework_codes if not already done
        for code, area in code_to_area.items():
            match = re.search(r'(\d+)$', code)
            if match:
                prefix = code[:match.start()]
                number = match.group(1)
                framework_code = prefix + '_' + number
            else:
                framework_code = code
            framework_codes.append(framework_code)
    
    logging.info(f"Starting association updates for {len(framework_codes)} frameworks")
    logging.debug(f"Framework codes available for associations: {framework_codes}")
    
    # Load term_ids
    try:
        with open('term_ids.json', 'r') as f:
            term_ids = json.load(f)
    except FileNotFoundError:
        logging.error("term_ids.json not found. Run step 2 first.")
        return
    
    if dry_run:
        pass  # No adjustment needed since URLs use constructed identifiers
    
    # Dictionaries for associations
    domain_associations = {fw: set() for fw in framework_codes}
    skill_associations = {}
    subskill_associations = {}
    
    with open(CSV_FILE, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader, start=1):
            row = {k.strip(): v.strip() for k, v in row.items()}
            original_code = row.get('Domain_Code')
            if original_code is None:
                logging.warning(f"Row {idx}: Missing 'Domain_Code'. Row data: {row}")
                continue
            match = re.search(r'(\d+)$', original_code)
            if match:
                prefix = original_code[:match.start()]
                number = match.group(1)
                framework_code = prefix + '_' + number
            else:
                framework_code = original_code
            if framework_code not in framework_codes:
                logging.debug(f"Row {idx}: Skipping association build because framework_code {framework_code} not in {framework_codes}")
                continue
            
            skill_key = f"{framework_code}_{row['Competency_Code'].lower()}"
            subskill_key = f"{framework_code}_{row['Sub-competency_Code'].lower()}"
            observable_key = f"{framework_code}_{row['Code observable element'].lower()}"
            logging.debug(f"Row {idx}: skill_key={skill_key} subskill_key={subskill_key} observable_key={observable_key}")
            
            # Collect associations
            if framework_code in term_ids['domain'] and skill_key in term_ids['skill']:
                domain_associations[framework_code].add(term_ids['skill'][skill_key])
            else:
                if framework_code not in term_ids['domain']:
                    logging.debug(f"Row {idx}: Domain term id missing for framework {framework_code}")
                if skill_key not in term_ids['skill']:
                    logging.debug(f"Row {idx}: Skill term id missing for key {skill_key}")
            if skill_key in term_ids['skill'] and subskill_key in term_ids['subSkill']:
                if skill_key not in skill_associations:
                    skill_associations[skill_key] = set()
                skill_associations[skill_key].add(term_ids['subSkill'][subskill_key])
            else:
                if skill_key not in term_ids['skill']:
                    logging.debug(f"Row {idx}: Cannot associate subskill because skill id missing for {skill_key}")
                if subskill_key not in term_ids['subSkill']:
                    logging.debug(f"Row {idx}: Subskill term id missing for key {subskill_key}")
            if subskill_key in term_ids['subSkill'] and observable_key in term_ids['observableElement']:
                if subskill_key not in subskill_associations:
                    subskill_associations[subskill_key] = set()
                subskill_associations[subskill_key].add(term_ids['observableElement'][observable_key])
            else:
                if subskill_key not in term_ids['subSkill']:
                    logging.debug(f"Row {idx}: Cannot associate observable because subskill id missing for {subskill_key}")
                if observable_key not in term_ids['observableElement']:
                    logging.debug(f"Row {idx}: Observable term id missing for key {observable_key}")
    
    # Update associations
    domain_updates = 0
    skill_updates = 0
    subskill_updates = 0
    
    # Domain associations
    for fw, skills in domain_associations.items():
        if skills:
            # Remove category and framework from node_id
            raw_node_id = term_ids['domain'][fw]
            node_id = raw_node_id.split('_')[-1] if '_' in raw_node_id else raw_node_id
            logging.info(f"Updating domain associations for {fw} (node_id: {node_id}) with {len(skills)} skills")
            url = f"{host}/api/framework/v1/term/update/{node_id}?framework={fw}&category=domain"
            headers = {
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {apikey}',
                'x-channel-id': channel_id
            }
            data = {
                "request": {
                    "term": {
                        "associations": [{"identifier": sid} for sid in skills]
                    }
                }
            }
            response = send_request('PATCH', url, headers, data, dry_run)
            if dry_run:
                logging.info(f"Domain associations updated successfully for {fw} (dry-run)")
                domain_updates += 1
            elif response and response.status_code == 200:
                logging.info(f"Domain associations updated successfully for {fw}")
                domain_updates += 1
            else:
                logging.error(f"Failed to update domain associations for {fw}")
    
    # Skill associations
    for skill_key, subskills in skill_associations.items():
        if subskills:
            fw, skill_code = skill_key.rsplit('_', 1)
            raw_node_id = term_ids['skill'][skill_key]
            node_id = raw_node_id.split('_')[-1] if '_' in raw_node_id else raw_node_id
            logging.info(f"Updating skill associations for {fw} (node_id: {node_id}) with {len(subskills)} subskills")
            url = f"{host}/api/framework/v1/term/update/{node_id}?framework={fw}&category=skill"
            headers = {
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {apikey}',
                'x-channel-id': channel_id
            }
            data = {
                "request": {
                    "term": {
                        "associations": [{"identifier": sid} for sid in subskills]
                    }
                }
            }
            response = send_request('PATCH', url, headers, data, dry_run)
            if dry_run:
                logging.info(f"Skill associations updated successfully for {fw} (dry-run)")
                skill_updates += 1
            elif response and response.status_code == 200:
                logging.info(f"Skill associations updated successfully for {fw}")
                skill_updates += 1
            else:
                logging.error(f"Failed to update skill associations for {fw}")
    
    # SubSkill associations
    for subskill_key, observables in subskill_associations.items():
        if observables:
            fw, subskill_code = subskill_key.rsplit('_', 1)
            raw_node_id = term_ids['subSkill'][subskill_key]
            node_id = raw_node_id.split('_')[-1] if '_' in raw_node_id else raw_node_id
            logging.info(f"Updating subskill associations for {fw} (node_id: {node_id}) with {len(observables)} observable elements")
            url = f"{host}/api/framework/v1/term/update/{node_id}?framework={fw}&category=subSkill"
            headers = {
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {apikey}',
                'x-channel-id': channel_id
            }
            data = {
                "request": {
                    "term": {
                        "associations": [{"identifier": oid} for oid in observables]
                    }
                }
            }
            response = send_request('PATCH', url, headers, data, dry_run)
            if dry_run:
                logging.info(f"Subskill associations updated successfully for {fw} (dry-run)")
                subskill_updates += 1
            elif response and response.status_code == 200:
                logging.info(f"Subskill associations updated successfully for {fw}")
                subskill_updates += 1
            else:
                logging.error(f"Failed to update subskill associations for {fw}")
    
    logging.info(f"Association updates completed: Domains: {domain_updates}, Skills: {skill_updates}, Subskills: {subskill_updates}")

def publish_frameworks(dry_run=False):
    global framework_codes
    if not framework_codes:
        for code, area in code_to_area.items():
            match = re.search(r'(\d+)$', code)
            if match:
                prefix = code[:match.start()]
                number = match.group(1)
                framework_code = prefix + '_' + number
            else:
                framework_code = code
            framework_codes.append(framework_code)
    logging.info(f"Publishing {len(framework_codes)} frameworks")
    success_count = 0
    for framework_code in framework_codes:
        url = f"{host}/api/framework/v1/publish/{framework_code}"
        headers = {
            'Content-Type': 'application/json',
            'X-Channel-Id': channel_id,
            'Authorization': f'Bearer {apikey}'
        }
        data = {}
        response = send_request('POST', url, headers, data, dry_run)
        if dry_run:
            logging.info(f"Framework {framework_code} published successfully (dry-run)")
            success_count += 1
        elif response and response.status_code == 200:
            logging.info(f"Framework {framework_code} published successfully")
            success_count += 1
        else:
            logging.error(f"Failed to publish framework {framework_code}")
    logging.info(f"Framework publishing completed: {success_count}/{len(framework_codes)} successful")

def clean_string(s):
    return s.replace('\u00a0', ' ')

def clean_dict(d):
    if isinstance(d, dict):
        return {clean_string(k): clean_dict(v) for k, v in d.items()}
    elif isinstance(d, str):
        return clean_string(d)
    else:
        return d

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Framework Creation Script")
    parser.add_argument('--step', choices=['setup', 'terms', 'associations', 'publish', 'all'], required=True, help="Step to run: setup=frameworks/categories, terms=term creation, associations=update associations, publish=publish frameworks, all=all steps")
    parser.add_argument('--dry-run', action='store_true', help="Print requests without sending them")
    args = parser.parse_args()
    
    if args.step == 'setup':
        logging.info("Running setup: Create frameworks and categories")
        create_frameworks(args.dry_run)
        create_master_and_categories(args.dry_run)
    elif args.step == 'terms':
        logging.info("Running terms: Create terms")
        create_terms(args.dry_run)
    elif args.step == 'associations':
        logging.info("Running associations: Update associations")
        update_associations(args.dry_run)
    elif args.step == 'publish':
        logging.info("Running publish: Publish frameworks")
        publish_frameworks(args.dry_run)
    elif args.step == 'all':
        logging.info("Running all steps")
        create_frameworks(args.dry_run)
        create_master_and_categories(args.dry_run)
        create_terms(args.dry_run)
        update_associations(args.dry_run)
        publish_frameworks(args.dry_run)
