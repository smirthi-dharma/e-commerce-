from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView
from .models import ShoppingActivity


class ActivityThrottle(SimpleRateThrottle):
    rate = "60/min"
    scope = "shopping_activity"
    def get_cache_key(self, request, view):
        return self.cache_format % {"scope":self.scope,"ident":self.get_ident(request)}


class ActivityView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ActivityThrottle]
    def post(self, request):
        class EventInput(serializers.ModelSerializer):
            class Meta:
                model = ShoppingActivity
                fields = ["kind", "product"]
        serializer = EventInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.validated_data.get("product")
        if product and not (product.is_active and product.category.is_active and product.stock > 0):
            return Response(status=204)
        serializer.save()
        return Response(status=204)
