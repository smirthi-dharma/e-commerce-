"""Small, deterministic multilingual grocery search, without external services."""
from difflib import get_close_matches
from django.db.models import Case, IntegerField, Q, Value, When

SYNONYMS = {
    "arisi": "rice", "அரிசி": "rice", "paal": "milk", "பால்": "milk",
    "thakkali": "tomato", "தக்காளி": "tomato", "paruppu": "dal", "பருப்பு": "dal",
    "ennai": "oil", "எண்ணெய்": "oil", "sakkarai": "sugar", "சர்க்கரை": "sugar",
    "aata": "atta", "yoghurt": "curd", "yogurt": "curd", "dahi": "curd",
}


def search_products(queryset, query):
    words = query.strip().lower().split()[:8]
    fields = ["name", "brand", "pack_size", "search_keywords", "description", "category__name"]
    for word in words:
        normalized = SYNONYMS.get(word, word)
        condition = Q()
        for term in {word, normalized}:
            for field in fields:
                condition |= Q(**{f"{field}__icontains": term})
        # Bound typo suggestions to actual active inventory, avoiding unbounded fuzzy scans.
        if len(word) >= 4 and not queryset.filter(condition).exists():
            vocabulary = set()
            for name in queryset.values_list("name", flat=True)[:500]:
                vocabulary.update(name.lower().split())
            for match in get_close_matches(normalized, vocabulary, n=2, cutoff=.78):
                condition |= Q(name__icontains=match)
        queryset = queryset.filter(condition)
    if words:
        term = SYNONYMS.get(words[0], words[0])
        queryset = queryset.annotate(search_rank=Case(
            When(name__iexact=term, then=Value(0)), When(name__istartswith=term, then=Value(1)),
            When(brand__iexact=term, then=Value(2)), default=Value(3), output_field=IntegerField(),
        ))
    return queryset
