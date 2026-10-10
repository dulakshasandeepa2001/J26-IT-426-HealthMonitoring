import zipfile
import xml.etree.ElementTree as ET
import sys

def extract_text_from_docx(docx_path):
    try:
        with zipfile.ZipFile(docx_path) as docx:
            xml_content = docx.read('word/document.xml')
            tree = ET.fromstring(xml_content)
            
            # The namespace for Word XML
            namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            
            # Extract all text nodes
            text = []
            for node in tree.iterfind('.//w:t', namespaces):
                if node.text:
                    text.append(node.text)
            return '\n'.join(text)
    except Exception as e:
        return str(e)

print(extract_text_from_docx(sys.argv[1]))
