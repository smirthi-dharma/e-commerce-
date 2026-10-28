from django.db.models import Q
from django.utils import timezone


def sale_date_filter():
    # The optional sell-by date is inclusive. Evaluate at request time, including after midnight.
    return Q(best_before__isnull=True) | Q(best_before__gte=timezone.localdate())
